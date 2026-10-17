// Referências e conversão de documentos do Firestore para tipos simples.

import { Timestamp, type DocumentData, type DocumentSnapshot } from "firebase-admin/firestore";
import { db } from "../firebase-admin";
import type { AuditEntry, Customer, Fulfillment, Order, OrderLine, Payment, PaymentMethod, Refund } from "../types";

export function businessRef(businessId: string) {
  return db().collection("businesses").doc(businessId);
}

export const col = {
  stores: (b: string) => businessRef(b).collection("stores"),
  customers: (b: string) => businessRef(b).collection("customers"),
  orders: (b: string) => businessRef(b).collection("orders"),
  payments: (b: string) => businessRef(b).collection("payments"),
  refunds: (b: string) => businessRef(b).collection("refunds"),
  audit: (b: string) => businessRef(b).collection("audit"),
  idempotency: (b: string) => businessRef(b).collection("idempotency"),
  users: () => db().collection("users"),
  /** Contas de acesso: um documento por utilizador (o id é o nome de utilizador). */
  logins: () => db().collection("logins"),
};

export function toMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strOrNull = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

export function toLine(raw: DocumentData): OrderLine {
  return {
    id: str(raw.id),
    name: str(raw.name),
    priceCents: num(raw.priceCents),
    qty: num(raw.qty),
  };
}

const FULFILLMENTS: Fulfillment[] = ["awaiting", "ready", "collected", "cancelled"];

export function toOrder(id: string, d: DocumentData): Order {
  const fulfillment = FULFILLMENTS.includes(d.fulfillment) ? (d.fulfillment as Fulfillment) : "awaiting";
  return {
    id,
    number: str(d.number),
    storeId: str(d.storeId),
    customerId: str(d.customerId),
    customerName: str(d.customerName),
    customerPhone: str(d.customerPhone),
    createdAtMs: toMs(d.createdAt) ?? 0,
    createdDate: str(d.createdDate),
    totalCents: num(d.totalCents),
    paymentsCents: num(d.paymentsCents),
    refundsCents: num(d.refundsCents),
    paidCents: num(d.paidCents),
    retainedCents: num(d.retainedCents),
    fulfillment,
    lines: Array.isArray(d.lines) ? d.lines.map((l: DocumentData) => toLine(l)) : [],
    readyAtMs: toMs(d.readyAt),
    readyByName: strOrNull(d.readyByName),
    collectedAtMs: toMs(d.collectedAt),
    collectedDate: strOrNull(d.collectedDate),
    collectedByName: strOrNull(d.collectedByName),
    collectedNote: strOrNull(d.collectedNote),
    cancelledAtMs: toMs(d.cancelledAt),
    cancelReason: strOrNull(d.cancelReason),
    notes: str(d.notes),
  };
}

export function orderFromSnap(snap: DocumentSnapshot): Order {
  return toOrder(snap.id, snap.data() ?? {});
}

/** Linhas de uma encomenda como são gravadas. */
export function linesForWrite(lines: OrderLine[]): DocumentData[] {
  return lines.map((l) => ({ id: l.id, name: l.name, priceCents: l.priceCents, qty: l.qty }));
}

export function toPayment(id: string, d: DocumentData): Payment {
  return {
    id,
    orderId: str(d.orderId),
    orderNumber: str(d.orderNumber),
    storeId: str(d.storeId),
    amountCents: num(d.amountCents),
    method: (str(d.method) || "outro") as PaymentMethod,
    reference: str(d.reference),
    note: str(d.note),
    date: str(d.date),
    status: d.status === "reversed" ? "reversed" : "valid",
    reverseReason: strOrNull(d.reverseReason),
    byUid: str(d.byUid),
    byName: str(d.byName),
    createdAtMs: toMs(d.createdAt) ?? 0,
  };
}

export function toRefund(id: string, d: DocumentData): Refund {
  return {
    id,
    orderId: str(d.orderId),
    orderNumber: str(d.orderNumber),
    storeId: str(d.storeId),
    amountCents: num(d.amountCents),
    method: (str(d.method) || "outro") as PaymentMethod,
    date: str(d.date),
    reason: str(d.reason),
    byUid: str(d.byUid),
    byName: str(d.byName),
    createdAtMs: toMs(d.createdAt) ?? 0,
  };
}

export function toCustomer(id: string, d: DocumentData): Customer {
  return { id, name: str(d.name), phone: str(d.phone), notes: str(d.notes) };
}

export function toAudit(id: string, d: DocumentData): AuditEntry {
  const kind = d.kind === "edicao" || d.kind === "utilizadores" ? d.kind : "correcao";
  return {
    id,
    kind,
    action: str(d.action),
    label: str(d.label),
    orderId: strOrNull(d.orderId),
    orderNumber: strOrNull(d.orderNumber),
    storeId: strOrNull(d.storeId),
    reason: strOrNull(d.reason),
    byName: str(d.byName),
    atMs: toMs(d.at) ?? 0,
  };
}
