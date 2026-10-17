"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldValue } from "firebase-admin/firestore";
import { getContext } from "@/lib/session";
import { isValidIsoDay, todayIso } from "@/lib/dates";
import { UserError, balanceOf } from "@/lib/domain";
import { formatMT } from "@/lib/money";
import { col, orderFromSnap, toItem } from "@/lib/server/repo";
import { required, runOnce, stockFieldUpdates, text, toActionError, writeAudit, writeMovement } from "@/lib/server/tx";
import type { ActionState, Item } from "@/lib/types";

function qtyByItem(lines: { itemId: string; qty: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) map.set(line.itemId, (map.get(line.itemId) ?? 0) + line.qty);
  return map;
}

export async function collectOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let orderId = "";
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    const key = required(fd, "key", "A chave do pedido", 80);
    orderId = required(fd, "orderId", "A encomenda", 80);
    const date = text(fd, "date", 10) || todayIso(ctx.tz);
    if (!isValidIsoDay(date) || date > todayIso(ctx.tz)) throw new UserError("A data do levantamento não é válida.");
    const note = text(fd, "note", 300);
    const actor = { uid: ctx.uid, name: ctx.name };

    await runOnce(businessId, key, async (tx) => {
      const orderRef = col.orders(businessId).doc(orderId);
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new UserError("A encomenda já não existe.");
      const order = orderFromSnap(snap);
      if (order.fulfillment === "collected") throw new UserError("Esta encomenda já foi levantada.");
      if (order.fulfillment === "cancelled") throw new UserError("Uma encomenda cancelada não pode ser levantada.");
      const balance = balanceOf(order.totalCents, order.paidCents);
      if (balance > 0) throw new UserError(`Faltam ${formatMT(balance)} para poder levantar.`);
      if (order.fulfillment !== "ready") throw new UserError("Ainda há artigos a aguardar mercadoria nesta encomenda.");

      const needs = qtyByItem(order.lines);
      const itemSnaps = await tx.getAll(...[...needs.keys()].map((id) => col.items(businessId).doc(id)));
      const items = new Map<string, Item>();
      for (const s of itemSnaps) if (s.exists) items.set(s.id, toItem(s.id, s.data() ?? {}));

      for (const [itemId, qty] of needs) {
        const item = items.get(itemId);
        const level = item?.stock[order.storeId] ?? { physical: 0, reserved: 0 };
        if (!item || level.physical < qty || level.reserved < qty) {
          throw new UserError(`O stock registado de ${item?.name ?? "um artigo"} não chega. Verifique o stock antes de levantar.`);
        }
      }

      for (const [itemId, qty] of needs) {
        tx.update(col.items(businessId).doc(itemId), stockFieldUpdates(order.storeId, -qty, -qty));
      }
      for (const line of order.lines) {
        writeMovement(tx, businessId, actor, {
          itemId: line.itemId,
          itemName: line.name,
          storeId: order.storeId,
          qty: -line.qty,
          type: "levantamento",
          date,
          orderId: order.id,
          orderNumber: order.number,
        });
      }
      tx.update(orderRef, {
        fulfillment: "collected",
        openKey: null,
        collectedAt: FieldValue.serverTimestamp(),
        collectedDate: date,
        collectedByUid: ctx.uid,
        collectedByName: ctx.name,
        collectedNote: note || null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { orderId: order.id };
    });
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(`/encomendas/${orderId}?msg=levantada`);
}

export async function undoCollection(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let orderId = "";
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    const key = required(fd, "key", "A chave do pedido", 80);
    orderId = required(fd, "orderId", "A encomenda", 80);
    const reason = required(fd, "reason", "O motivo", 500);
    const actor = { uid: ctx.uid, name: ctx.name };

    await runOnce(businessId, key, async (tx) => {
      const orderRef = col.orders(businessId).doc(orderId);
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new UserError("A encomenda já não existe.");
      const order = orderFromSnap(snap);
      if (order.fulfillment !== "collected") throw new UserError("Esta encomenda não está levantada.");

      const needs = qtyByItem(order.lines);
      for (const [itemId, qty] of needs) {
        tx.update(col.items(businessId).doc(itemId), stockFieldUpdates(order.storeId, qty, qty));
      }
      const date = todayIso(ctx.tz);
      for (const line of order.lines) {
        writeMovement(tx, businessId, actor, {
          itemId: line.itemId,
          itemName: line.name,
          storeId: order.storeId,
          qty: line.qty,
          type: "anulacao",
          date,
          orderId: order.id,
          orderNumber: order.number,
          reason,
        });
      }
      tx.update(orderRef, {
        fulfillment: "ready",
        openKey: null,
        lines: order.lines.map((l) => ({ ...l, reserved: l.qty })),
        collectedAt: null,
        collectedDate: null,
        collectedByUid: null,
        collectedByName: null,
        collectedNote: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeAudit(tx, businessId, actor, {
        kind: "correcao",
        action: "anulacao_levantamento",
        label: `Levantamento anulado (era de ${order.collectedDate ?? "data desconhecida"})`,
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
  redirect(`/encomendas/${orderId}?msg=anulado`);
}
