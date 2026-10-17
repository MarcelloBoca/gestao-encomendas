"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { z } from "zod";
import { getContext } from "@/lib/session";
import { todayIso } from "@/lib/dates";
import { UserError, cleanLines, totalOf, type LineInput } from "@/lib/domain";
import { formatMT, parseMoney } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { col, linesForWrite, orderFromSnap } from "@/lib/server/repo";
import { required, runOnce, text, toActionError, writeAudit } from "@/lib/server/tx";
import type { ActionState, ArrivalState, OrderLine, ReadyOrderInfo } from "@/lib/types";

const lineSchema = z.object({
  lineId: z.string().max(80).optional(),
  name: z.string().max(400),
  qty: z.number().int("A quantidade tem de ser um número inteiro.").min(1, "A quantidade mínima é 1.").max(10_000),
  price: z.string().max(30),
});

const linesSchema = z.array(lineSchema).max(60, "Demasiados artigos numa encomenda.");

function parseLines(fd: FormData): LineInput[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text(fd, "lines", 60_000) || "[]");
  } catch {
    throw new UserError("Não foi possível ler os artigos. Atualize a página e tente de novo.");
  }
  const parsed = linesSchema.safeParse(raw);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Artigos inválidos.");
  const inputs = (parsed.data as { lineId?: string; name: string; qty: number; price: string }[]).map((line, index) => {
    const priceCents = parseMoney(line.price);
    if (priceCents === null) throw new UserError(`O preço do artigo ${index + 1} não é válido. Use, por exemplo, 1 350,00.`);
    return { lineId: line.lineId, name: line.name, qty: line.qty, priceCents };
  });
  return cleanLines(inputs);
}

function parseCustomer(fd: FormData) {
  const customerName = required(fd, "customerName", "O nome da cliente", 120);
  const customerPhone = normalizePhone(text(fd, "customerPhone", 30));
  const notes = text(fd, "notes", 1000);
  return { customerName, customerPhone, notes };
}

export async function createOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let orderId = "";
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    const key = required(fd, "key", "A chave do pedido", 80);
    const storeId = required(fd, "storeId", "A loja", 80);
    if (!ctx.activeStores.some((s) => s.id === storeId)) throw new UserError("Escolha uma loja válida.");
    const customerIdInput = text(fd, "customerId", 80);
    const common = parseCustomer(fd);
    const inputs = parseLines(fd);
    const lines: OrderLine[] = inputs.map((input) => ({ id: randomUUID(), name: input.name, priceCents: input.priceCents, qty: input.qty }));
    const totalCents = totalOf(lines);

    const result = await runOnce(businessId, key, async (tx) => {
      const storeRef = col.stores(businessId).doc(storeId);
      const storeSnap = await tx.get(storeRef);

      let customerRef = customerIdInput ? col.customers(businessId).doc(customerIdInput) : null;
      let customerData: DocumentData | null = null;
      if (customerRef) {
        const snap = await tx.get(customerRef);
        if (snap.exists) customerData = snap.data() ?? {};
        else customerRef = null;
      }
      if (!customerRef && common.customerPhone) {
        const found = await tx.get(col.customers(businessId).where("phone", "==", common.customerPhone).limit(1));
        if (!found.empty) {
          customerRef = found.docs[0].ref;
          customerData = found.docs[0].data();
        }
      }

      if (!storeSnap.exists) throw new UserError("A loja escolhida já não existe.");
      const counter = Number(storeSnap.get("counter") ?? 0) + 1;
      const prefix = String(storeSnap.get("prefix") ?? "LOJ");
      const number = `${prefix}-${String(counter).padStart(4, "0")}`;
      tx.update(storeRef, { counter });

      if (!customerRef) {
        customerRef = col.customers(businessId).doc();
        tx.set(customerRef, {
          name: common.customerName,
          phone: common.customerPhone,
          notes: "",
          createdAt: FieldValue.serverTimestamp(),
        });
      } else if (customerData && (customerData.name !== common.customerName || (!customerData.phone && common.customerPhone))) {
        tx.update(customerRef, {
          name: common.customerName,
          ...(common.customerPhone && !customerData.phone ? { phone: common.customerPhone } : {}),
        });
      }

      const orderRef = col.orders(businessId).doc();
      tx.set(orderRef, {
        number,
        storeId,
        customerId: customerRef.id,
        customerName: common.customerName,
        customerPhone: common.customerPhone,
        createdAt: FieldValue.serverTimestamp(),
        createdDate: todayIso(ctx.tz),
        createdByUid: ctx.uid,
        createdByName: ctx.name,
        totalCents,
        paymentsCents: 0,
        refundsCents: 0,
        paidCents: 0,
        retainedCents: 0,
        lines: linesForWrite(lines),
        fulfillment: "awaiting",
        readyAt: null,
        readyByName: null,
        collectedAt: null,
        collectedDate: null,
        collectedByName: null,
        collectedNote: null,
        cancelledAt: null,
        cancelReason: null,
        notes: common.notes,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { orderId: orderRef.id };
    });
    orderId = String(result?.orderId ?? "");
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(`/encomendas/${orderId}?msg=criada`);
}

export async function updateOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let orderId = "";
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    const key = required(fd, "key", "A chave do pedido", 80);
    orderId = required(fd, "orderId", "A encomenda", 80);
    const common = parseCustomer(fd);
    const inputs = parseLines(fd);
    const confirmed = text(fd, "confirm", 5) === "1";
    const actor = { uid: ctx.uid, name: ctx.name };

    await runOnce(businessId, key, async (tx) => {
      const orderRef = col.orders(businessId).doc(orderId);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new UserError("A encomenda já não existe.");
      const order = orderFromSnap(orderSnap);
      if (order.fulfillment !== "awaiting" && order.fulfillment !== "ready") {
        throw new UserError("Só é possível editar encomendas que ainda não foram levantadas nem canceladas.");
      }

      const oldIds = new Set(order.lines.map((l) => l.id));
      const lines: OrderLine[] = inputs.map((input) => ({
        id: input.lineId && oldIds.has(input.lineId) ? input.lineId : randomUUID(),
        name: input.name,
        priceCents: input.priceCents,
        qty: input.qty,
      }));
      const totalCents = totalOf(lines);

      if (totalCents < order.paidCents) {
        throw new UserError(
          `O novo total (${formatMT(totalCents)}) fica abaixo do valor já pago (${formatMT(order.paidCents)}). ` +
            `Registe primeiro um reembolso de ${formatMT(order.paidCents - totalCents)} ou corrija a alteração.`,
        );
      }
      if (totalCents !== order.totalCents && !confirmed) {
        throw new UserError("Confirme a alteração do valor acordado.");
      }

      tx.update(orderRef, {
        lines: linesForWrite(lines),
        customerName: common.customerName,
        customerPhone: common.customerPhone,
        totalCents,
        notes: common.notes,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const totalChanged = totalCents !== order.totalCents;
      writeAudit(tx, businessId, actor, {
        kind: order.paidCents > 0 && totalChanged ? "correcao" : "edicao",
        action: order.paidCents > 0 && totalChanged ? "edicao_apos_pagamento" : "edicao",
        label: totalChanged
          ? `Encomenda alterada: total de ${formatMT(order.totalCents)} para ${formatMT(totalCents)}`
          : "Encomenda alterada",
        orderId: order.id,
        orderNumber: order.number,
        storeId: order.storeId,
        before: { totalCents: order.totalCents, lines: linesForWrite(order.lines) },
        after: { totalCents, lines: linesForWrite(lines) },
        key,
      });
      return { orderId: order.id };
    });
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(`/encomendas/${orderId}?msg=alterada`);
}

export async function cancelOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let orderId = "";
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    const key = required(fd, "key", "A chave do pedido", 80);
    orderId = required(fd, "orderId", "A encomenda", 80);
    const reason = required(fd, "reason", "O motivo", 500);
    const retain = text(fd, "retain", 5) === "1";
    const actor = { uid: ctx.uid, name: ctx.name };

    await runOnce(businessId, key, async (tx) => {
      const orderRef = col.orders(businessId).doc(orderId);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new UserError("A encomenda já não existe.");
      const order = orderFromSnap(orderSnap);
      if (order.fulfillment === "cancelled") throw new UserError("Esta encomenda já está cancelada.");
      if (order.fulfillment === "collected") throw new UserError("Uma encomenda levantada não pode ser cancelada. Anule primeiro o levantamento.");
      if (order.paidCents > 0 && !retain) {
        throw new UserError(
          `Esta encomenda tem ${formatMT(order.paidCents)} pagos. Registe primeiro o reembolso ou marque o valor como retido.`,
        );
      }

      tx.update(orderRef, {
        fulfillment: "cancelled",
        retainedCents: retain ? order.paidCents : 0,
        cancelReason: reason,
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledByName: ctx.name,
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeAudit(tx, businessId, actor, {
        kind: "correcao",
        action: "cancelamento",
        label: retain ? `Encomenda cancelada com ${formatMT(order.paidCents)} retidos` : "Encomenda cancelada",
        orderId: order.id,
        orderNumber: order.number,
        storeId: order.storeId,
        reason,
        key,
      });
      return { orderId: order.id };
    });
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(`/encomendas/${orderId}?msg=cancelada`);
}

/** Marca a mercadoria como chegada em várias encomendas. Ignora as que já não estão a aguardar. */
async function arrive(businessId: string, key: string, orderIds: string[], actor: { uid: string; name: string }): Promise<ReadyOrderInfo[]> {
  const result = await runOnce(businessId, key, async (tx) => {
    const refs = orderIds.map((id) => col.orders(businessId).doc(id));
    const snaps = await tx.getAll(...refs);
    const ready: ReadyOrderInfo[] = [];
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const order = orderFromSnap(snap);
      if (order.fulfillment !== "awaiting") continue;
      tx.update(snap.ref, {
        fulfillment: "ready",
        readyAt: FieldValue.serverTimestamp(),
        readyByName: actor.name,
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeAudit(tx, businessId, actor, {
        kind: "edicao",
        action: "chegada",
        label: "Mercadoria marcada como chegada",
        orderId: order.id,
        orderNumber: order.number,
        storeId: order.storeId,
        key,
      });
      ready.push({
        id: order.id,
        number: order.number,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        totalCents: order.totalCents,
        paidCents: order.paidCents,
      });
    }
    return { ready };
  });
  return Array.isArray(result?.ready) ? (result.ready as ReadyOrderInfo[]) : [];
}

/** Botão "Chegou" no detalhe da encomenda. */
export async function markArrived(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let orderId = "";
  try {
    const ctx = await getContext();
    const key = required(fd, "key", "A chave do pedido", 80);
    orderId = required(fd, "orderId", "A encomenda", 80);
    const ready = await arrive(ctx.businessId, key, [orderId], { uid: ctx.uid, name: ctx.name });
    if (ready.length === 0) {
      const snap = await col.orders(ctx.businessId).doc(orderId).get();
      if (!snap.exists) throw new UserError("A encomenda já não existe.");
      const order = orderFromSnap(snap);
      if (order.fulfillment !== "ready") throw new UserError("Esta encomenda já não está a aguardar mercadoria.");
    }
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(`/encomendas/${orderId}?msg=chegou`);
}

/** Página "Mercadoria chegou": marca várias encomendas de uma vez e devolve as que ficaram prontas. */
export async function markArrivedMany(_prev: ArrivalState, fd: FormData): Promise<ArrivalState> {
  try {
    const ctx = await getContext();
    const key = required(fd, "key", "A chave do pedido", 80);
    const ids = [...new Set(fd.getAll("orderId").filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 80))];
    if (ids.length === 0) throw new UserError("Escolha pelo menos uma encomenda.");
    if (ids.length > 100) throw new UserError("Escolha no máximo 100 encomendas de cada vez.");
    const ready = await arrive(ctx.businessId, key, ids, { uid: ctx.uid, name: ctx.name });
    revalidatePath("/", "layout");
    if (ready.length === 0) return { error: "Estas encomendas já não estavam a aguardar mercadoria." };
    return {
      ok: true,
      message: ready.length === 1 ? "1 encomenda ficou pronta." : `${ready.length} encomendas ficaram prontas.`,
      ready,
      storeName: ctx.store?.name ?? "",
    };
  } catch (error) {
    return toActionError(error);
  }
}

/** Corrige uma chegada marcada por engano: a encomenda volta a aguardar mercadoria. */
export async function undoArrival(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let orderId = "";
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    const key = required(fd, "key", "A chave do pedido", 80);
    orderId = required(fd, "orderId", "A encomenda", 80);
    const actor = { uid: ctx.uid, name: ctx.name };
    await runOnce(businessId, key, async (tx) => {
      const ref = col.orders(businessId).doc(orderId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new UserError("A encomenda já não existe.");
      const order = orderFromSnap(snap);
      if (order.fulfillment !== "ready") throw new UserError("Só é possível desmarcar a chegada de uma encomenda pronta.");
      tx.update(ref, { fulfillment: "awaiting", readyAt: null, readyByName: null, updatedAt: FieldValue.serverTimestamp() });
      writeAudit(tx, businessId, actor, {
        kind: "edicao",
        action: "chegada_anulada",
        label: "Chegada da mercadoria desmarcada",
        orderId: order.id,
        orderNumber: order.number,
        storeId: order.storeId,
        key,
      });
      return { orderId: order.id };
    });
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(`/encomendas/${orderId}?msg=desmarcada`);
}
