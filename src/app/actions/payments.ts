"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldValue } from "firebase-admin/firestore";
import { getContext } from "@/lib/session";
import { isValidIsoDay, todayIso } from "@/lib/dates";
import { UserError, balanceOf } from "@/lib/domain";
import { formatMT, parseMoney } from "@/lib/money";
import { col, orderFromSnap, toPayment } from "@/lib/server/repo";
import { required, runOnce, text, toActionError, writeAudit } from "@/lib/server/tx";
import { PAYMENT_METHODS, methodLabel, type ActionState, type PaymentMethod } from "@/lib/types";

function parseAmount(fd: FormData, name = "amount"): number {
  const cents = parseMoney(text(fd, name, 30));
  if (cents === null || cents <= 0) throw new UserError("Indique um valor maior que zero, por exemplo 4 500,00.");
  return cents;
}

function parseMethod(fd: FormData): PaymentMethod {
  const method = text(fd, "method", 30);
  if (!PAYMENT_METHODS.some((m) => m.id === method)) throw new UserError("Escolha o método de pagamento.");
  return method as PaymentMethod;
}

function parseDate(fd: FormData, tz: string): string {
  const date = text(fd, "date", 10) || todayIso(tz);
  if (!isValidIsoDay(date)) throw new UserError("A data não é válida.");
  if (date > todayIso(tz)) throw new UserError("A data não pode ser no futuro.");
  return date;
}

export async function registerPayment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let target = "";
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    const key = required(fd, "key", "A chave do pedido", 80);
    const orderId = required(fd, "orderId", "A encomenda", 80);
    const amountCents = parseAmount(fd);
    const method = parseMethod(fd);
    const date = parseDate(fd, ctx.tz);
    const reference = text(fd, "reference", 80);
    const note = text(fd, "note", 300);

    const result = await runOnce(businessId, key, async (tx) => {
      const orderRef = col.orders(businessId).doc(orderId);
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new UserError("A encomenda já não existe.");
      const order = orderFromSnap(snap);
      if (order.fulfillment === "cancelled") throw new UserError("Não é possível registar pagamentos numa encomenda cancelada.");
      if (order.fulfillment === "collected") throw new UserError("Esta encomenda já foi levantada e está paga.");
      const balance = balanceOf(order.totalCents, order.paidCents);
      if (balance <= 0) throw new UserError("Esta encomenda já está paga.");
      if (amountCents > balance) {
        throw new UserError(`O valor excede o saldo em dívida. O máximo é ${formatMT(balance)}.`);
      }

      const paymentRef = col.payments(businessId).doc();
      tx.set(paymentRef, {
        orderId: order.id,
        orderNumber: order.number,
        storeId: order.storeId,
        amountCents,
        method,
        reference,
        note,
        date,
        status: "valid",
        reverseReason: null,
        byUid: ctx.uid,
        byName: ctx.name,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(orderRef, {
        paymentsCents: FieldValue.increment(amountCents),
        paidCents: FieldValue.increment(amountCents),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { orderId: order.id, paymentId: paymentRef.id };
    });
    target = `/encomendas/${String(result?.orderId)}?pagamento=${String(result?.paymentId)}`;
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(target);
}

export async function reversePayment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let target = "";
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    const key = required(fd, "key", "A chave do pedido", 80);
    const paymentId = required(fd, "paymentId", "O pagamento", 80);
    const reason = required(fd, "reason", "O motivo", 500);
    const actor = { uid: ctx.uid, name: ctx.name };

    const result = await runOnce(businessId, key, async (tx) => {
      const paymentRef = col.payments(businessId).doc(paymentId);
      const paymentSnap = await tx.get(paymentRef);
      if (!paymentSnap.exists) throw new UserError("O pagamento já não existe.");
      const payment = toPayment(paymentSnap.id, paymentSnap.data() ?? {});
      const orderRef = col.orders(businessId).doc(payment.orderId);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new UserError("A encomenda já não existe.");
      const order = orderFromSnap(orderSnap);
      if (payment.status === "reversed") throw new UserError("Este pagamento já foi estornado.");
      if (order.fulfillment === "collected") {
        throw new UserError("A encomenda já foi levantada. Anule primeiro o levantamento para estornar um pagamento.");
      }
      if (order.fulfillment === "cancelled") throw new UserError("Não é possível estornar pagamentos de uma encomenda cancelada.");
      if (payment.amountCents > order.paidCents) {
        throw new UserError("O estorno deixaria o total pago negativo. Verifique os reembolsos desta encomenda.");
      }

      tx.update(paymentRef, {
        status: "reversed",
        reverseReason: reason,
        reversedByUid: ctx.uid,
        reversedByName: ctx.name,
        reversedAt: FieldValue.serverTimestamp(),
      });
      tx.update(orderRef, {
        paymentsCents: FieldValue.increment(-payment.amountCents),
        paidCents: FieldValue.increment(-payment.amountCents),
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeAudit(tx, businessId, actor, {
        kind: "correcao",
        action: "estorno",
        label: `Estorno de ${formatMT(payment.amountCents)} (${methodLabel(payment.method)}, ${payment.date})`,
        orderId: order.id,
        orderNumber: order.number,
        storeId: order.storeId,
        reason,
        key,
      });
      return { orderId: order.id };
    });
    target = `/encomendas/${String(result?.orderId)}?msg=estorno`;
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(target);
}

export async function registerRefund(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let target = "";
  try {
    const ctx = await getContext();
    const businessId = ctx.businessId;
    const key = required(fd, "key", "A chave do pedido", 80);
    const orderId = required(fd, "orderId", "A encomenda", 80);
    const amountCents = parseAmount(fd);
    const method = parseMethod(fd);
    const date = parseDate(fd, ctx.tz);
    const reason = required(fd, "reason", "O motivo", 500);
    const actor = { uid: ctx.uid, name: ctx.name };

    await runOnce(businessId, key, async (tx) => {
      const orderRef = col.orders(businessId).doc(orderId);
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new UserError("A encomenda já não existe.");
      const order = orderFromSnap(snap);
      if (order.fulfillment === "collected") throw new UserError("A encomenda já foi levantada. Anule primeiro o levantamento.");
      if (order.fulfillment === "cancelled") throw new UserError("Esta encomenda já está cancelada.");
      if (amountCents > order.paidCents) {
        throw new UserError(`O reembolso não pode exceder o total pago (${formatMT(order.paidCents)}).`);
      }

      tx.set(col.refunds(businessId).doc(), {
        orderId: order.id,
        orderNumber: order.number,
        storeId: order.storeId,
        amountCents,
        method,
        date,
        reason,
        byUid: ctx.uid,
        byName: ctx.name,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(orderRef, {
        refundsCents: FieldValue.increment(amountCents),
        paidCents: FieldValue.increment(-amountCents),
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeAudit(tx, businessId, actor, {
        kind: "correcao",
        action: "reembolso",
        label: `Reembolso de ${formatMT(amountCents)} (${methodLabel(method)}, ${date})`,
        orderId: order.id,
        orderNumber: order.number,
        storeId: order.storeId,
        reason,
        key,
      });
      return { orderId: order.id };
    });
    target = `/encomendas/${orderId}?msg=reembolso`;
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect(target);
}
