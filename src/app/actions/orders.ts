"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { z } from "zod";
import { getContext } from "@/lib/session";
import { isValidIsoDay, todayIso } from "@/lib/dates";
import {
  UserError,
  awaitingKey,
  computeTotals,
  editLines,
  fulfillmentFromLines,
  reserveFromPool,
  type LineInput,
} from "@/lib/domain";
import { formatMT, parseMoney } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { col, linesForWrite, orderFromSnap, toItem } from "@/lib/server/repo";
import {
  allocateToWaiting,
  loadWaiting,
  orderStateFields,
  required,
  runOnce,
  stockFieldUpdates,
  text,
  toActionError,
  writeAudit,
  writeWaitingChanges,
} from "@/lib/server/tx";
import type { ActionState, Item, OrderLine } from "@/lib/types";

const lineSchema = z.object({
  lineId: z.string().max(80).optional(),
  itemId: z.string().min(1).max(80),
  qty: z.number().int("A quantidade tem de ser um número inteiro.").min(1, "A quantidade mínima é 1.").max(10_000),
  price: z.string().max(30),
});

const linesSchema = z.array(lineSchema).min(1, "Adicione pelo menos um artigo.").max(60, "Demasiados artigos numa encomenda.");

interface ParsedLine {
  lineId?: string;
  itemId: string;
  qty: number;
  priceCents: number;
}

function parseLines(fd: FormData): ParsedLine[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text(fd, "lines", 40_000) || "[]");
  } catch {
    throw new UserError("Não foi possível ler os artigos. Atualize a página e tente de novo.");
  }
  const parsed = linesSchema.safeParse(raw);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Artigos inválidos.");
  return parsed.data.map((line) => {
    const priceCents = parseMoney(line.price);
    if (priceCents === null) throw new UserError("Há um preço inválido. Use, por exemplo, 1 350,00.");
    return { lineId: line.lineId, itemId: line.itemId, qty: line.qty, priceCents };
  });
}

function parseCommon(fd: FormData) {
  const customerName = required(fd, "customerName", "O nome do cliente", 120);
  const customerPhone = normalizePhone(text(fd, "customerPhone", 30));
  const expectedDate = text(fd, "expectedDate", 10) || null;
  if (expectedDate && !isValidIsoDay(expectedDate)) throw new UserError("A data prevista de chegada não é válida.");
  const discountCents = parseMoney(text(fd, "discount", 30) || "0");
  if (discountCents === null) throw new UserError("O desconto não é um valor válido.");
  const notes = text(fd, "notes", 1000);
  return { customerName, customerPhone, expectedDate, discountCents, notes };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
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
    const common = parseCommon(fd);
    const inputs = parseLines(fd);
    const result = await runOnce(businessId, key, async (tx) => {
      const storeRef = col.stores(businessId).doc(storeId);
      const itemIds = unique(inputs.map((l) => l.itemId));
      const snaps = await tx.getAll(storeRef, ...itemIds.map((id) => col.items(businessId).doc(id)));
      const storeSnap = snaps[0];
      const items = new Map<string, Item>();
      for (const snap of snaps.slice(1)) {
        if (snap.exists) items.set(snap.id, toItem(snap.id, snap.data() ?? {}));
      }

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
      const lines: OrderLine[] = inputs.map((input) => {
        const item = items.get(input.itemId);
        if (!item) throw new UserError("Um dos artigos já não existe.");
        if (item.archived) throw new UserError(`O artigo ${item.name} está arquivado.`);
        return { id: randomUUID(), itemId: item.id, name: item.name, priceCents: input.priceCents, qty: input.qty, reserved: 0 };
      });
      const totals = computeTotals(lines, common.discountCents);

      const pool = new Map<string, number>();
      for (const [id, item] of items) {
        const level = item.stock[storeId] ?? { physical: 0, reserved: 0 };
        pool.set(id, Math.max(0, level.physical - level.reserved));
      }
      reserveFromPool(lines, pool);

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

      const state = fulfillmentFromLines(lines);
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
        expectedDate: common.expectedDate,
        discountCents: common.discountCents,
        subtotalCents: totals.subtotalCents,
        totalCents: totals.totalCents,
        paymentsCents: 0,
        refundsCents: 0,
        paidCents: 0,
        retainedCents: 0,
        lines: linesForWrite(lines),
        fulfillment: state,
        openKey: state === "awaiting" ? awaitingKey(storeId) : null,
        readyAt: state === "ready" ? FieldValue.serverTimestamp() : null,
        collectedAt: null,
        collectedDate: null,
        collectedByName: null,
        collectedNote: null,
        cancelledAt: null,
        cancelReason: null,
        notes: common.notes,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const reservedByItem = new Map<string, number>();
      for (const line of lines) reservedByItem.set(line.itemId, (reservedByItem.get(line.itemId) ?? 0) + line.reserved);
      for (const [itemId, reserved] of reservedByItem) {
        if (reserved > 0) tx.update(col.items(businessId).doc(itemId), stockFieldUpdates(storeId, 0, reserved));
      }

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
    const common = parseCommon(fd);
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
      const storeId = order.storeId;
      const itemIds = unique([...inputs.map((l) => l.itemId), ...order.lines.map((l) => l.itemId)]);
      const itemSnaps = await tx.getAll(...itemIds.map((id) => col.items(businessId).doc(id)));
      const waiting = await loadWaiting(tx, businessId, storeId);

      const items = new Map<string, Item>();
      for (const snap of itemSnaps) if (snap.exists) items.set(snap.id, toItem(snap.id, snap.data() ?? {}));
      const oldById = new Map(order.lines.map((l) => [l.id, l]));

      const lineInputs: LineInput[] = inputs.map((input) => {
        const old = input.lineId ? oldById.get(input.lineId) : undefined;
        const item = items.get(input.itemId);
        if (!item) throw new UserError("Um dos artigos já não existe.");
        const sameItem = Boolean(old && old.itemId === input.itemId);
        if (item.archived && !sameItem) throw new UserError(`O artigo ${item.name} está arquivado.`);
        return {
          lineId: old ? old.id : undefined,
          itemId: item.id,
          name: old && old.itemId === input.itemId ? old.name : item.name,
          priceCents: input.priceCents,
          qty: input.qty,
        };
      });

      const pool = new Map<string, number>();
      for (const [id, item] of items) {
        const level = item.stock[storeId] ?? { physical: 0, reserved: 0 };
        pool.set(id, Math.max(0, level.physical - level.reserved));
      }
      const { lines, reservedDelta } = editLines(order.lines, lineInputs, pool, () => randomUUID());
      const totals = computeTotals(lines, common.discountCents);

      if (totals.totalCents < order.paidCents) {
        throw new UserError(
          `O novo total (${formatMT(totals.totalCents)}) fica abaixo do valor já pago (${formatMT(order.paidCents)}). ` +
            `Registe primeiro um reembolso de ${formatMT(order.paidCents - totals.totalCents)} ou corrija a alteração.`,
        );
      }
      if (totals.totalCents !== order.totalCents && !confirmed) {
        throw new UserError("Confirme a alteração do valor acordado.");
      }

      const freed = new Map<string, number>();
      for (const [itemId, delta] of reservedDelta) {
        if (delta < 0) freed.set(itemId, pool.get(itemId) ?? 0);
      }
      const { reservedByItem } = allocateToWaiting(freed, waiting, order.id);

      tx.update(orderRef, {
        ...orderStateFields(lines, storeId, order.fulfillment === "ready"),
        customerName: common.customerName,
        customerPhone: common.customerPhone,
        expectedDate: common.expectedDate,
        discountCents: common.discountCents,
        subtotalCents: totals.subtotalCents,
        totalCents: totals.totalCents,
        notes: common.notes,
        updatedAt: FieldValue.serverTimestamp(),
      });

      for (const itemId of itemIds) {
        const delta = (reservedDelta.get(itemId) ?? 0) + (reservedByItem.get(itemId) ?? 0);
        if (delta !== 0) tx.update(col.items(businessId).doc(itemId), stockFieldUpdates(storeId, 0, delta));
      }
      writeWaitingChanges(tx, waiting, storeId);

      const totalChanged = totals.totalCents !== order.totalCents;
      const label = totalChanged
        ? `Encomenda alterada: total de ${formatMT(order.totalCents)} para ${formatMT(totals.totalCents)}`
        : "Encomenda alterada";
      writeAudit(tx, businessId, actor, {
        kind: order.paidCents > 0 ? "correcao" : "edicao",
        action: order.paidCents > 0 ? "edicao_apos_pagamento" : "edicao",
        label,
        orderId: order.id,
        orderNumber: order.number,
        storeId,
        before: { totalCents: order.totalCents, lines: linesForWrite(order.lines) },
        after: { totalCents: totals.totalCents, lines: linesForWrite(lines) },
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

      const released = new Map<string, number>();
      for (const line of order.lines) {
        if (line.reserved > 0) released.set(line.itemId, (released.get(line.itemId) ?? 0) + line.reserved);
      }
      const itemIds = [...released.keys()];
      const itemSnaps = itemIds.length ? await tx.getAll(...itemIds.map((id) => col.items(businessId).doc(id))) : [];
      const waiting = itemIds.length ? await loadWaiting(tx, businessId, order.storeId) : [];

      const pool = new Map<string, number>();
      for (const snap of itemSnaps) {
        if (!snap.exists) continue;
        const item = toItem(snap.id, snap.data() ?? {});
        const level = item.stock[order.storeId] ?? { physical: 0, reserved: 0 };
        pool.set(item.id, Math.max(0, level.physical - level.reserved) + (released.get(item.id) ?? 0));
      }
      const { reservedByItem } = allocateToWaiting(pool, waiting, order.id);

      tx.update(orderRef, {
        fulfillment: "cancelled",
        openKey: null,
        lines: linesForWrite(order.lines.map((l) => ({ ...l, reserved: 0 }))),
        retainedCents: retain ? order.paidCents : 0,
        cancelReason: reason,
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledByName: ctx.name,
        updatedAt: FieldValue.serverTimestamp(),
      });
      for (const itemId of itemIds) {
        const delta = -(released.get(itemId) ?? 0) + (reservedByItem.get(itemId) ?? 0);
        if (delta !== 0) tx.update(col.items(businessId).doc(itemId), stockFieldUpdates(order.storeId, 0, delta));
      }
      writeWaitingChanges(tx, waiting, order.storeId);
      writeAudit(tx, businessId, actor, {
        kind: "correcao",
        action: "cancelamento",
        label: retain
          ? `Encomenda cancelada com ${formatMT(order.paidCents)} retidos`
          : "Encomenda cancelada",
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
