// Referências e conversão de documentos do Firestore para tipos simples.

import { Timestamp, type DocumentData, type DocumentSnapshot } from "firebase-admin/firestore";
import { db } from "../firebase-admin";
import type {
  AuditEntry,
  Category,
  Customer,
  Fulfillment,
  Item,
  Movement,
  MovementType,
  Order,
  OrderLine,
  Payment,
  PaymentMethod,
  Refund,
  StockLevel,
} from "../types";

export function businessRef(businessId: string) {
  return db().collection("businesses").doc(businessId);
}

export const col = {
  stores: (b: string) => businessRef(b).collection("stores"),
  categories: (b: string) => businessRef(b).collection("categories"),
  items: (b: string) => businessRef(b).collection("items"),
  customers: (b: string) => businessRef(b).collection("customers"),
  orders: (b: string) => businessRef(b).collection("orders"),
  payments: (b: string) => businessRef(b).collection("payments"),
  refunds: (b: string) => businessRef(b).collection("refunds"),
  movements: (b: string) => businessRef(b).collection("movements"),
  audit: (b: string) => businessRef(b).collection("audit"),
  idempotency: (b: string) => businessRef(b).collection("idempotency"),
  users: () => db().collection("users"),
  invites: () => db().collection("invites"),
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
    itemId: str(raw.itemId),
    name: str(raw.name),
    priceCents: num(raw.priceCents),
    qty: num(raw.qty),
    reserved: num(raw.reserved),
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
    expectedDate: strOrNull(d.expectedDate),
    discountCents: num(d.discountCents),
    subtotalCents: num(d.subtotalCents),
    totalCents: num(d.totalCents),
    paymentsCents: num(d.paymentsCents),
    refundsCents: num(d.refundsCents),
    paidCents: num(d.paidCents),
    retainedCents: num(d.retainedCents),
    fulfillment,
    lines: Array.isArray(d.lines) ? d.lines.map((l: DocumentData) => toLine(l)) : [],
    readyAtMs: toMs(d.readyAt),
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

/** Linhas e campos de uma encomenda como são gravados. */
export function linesForWrite(lines: OrderLine[]): DocumentData[] {
  return lines.map((l) => ({ id: l.id, itemId: l.itemId, name: l.name, priceCents: l.priceCents, qty: l.qty, reserved: l.reserved }));
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

export function toItem(id: string, d: DocumentData): Item {
  const stock: Record<string, StockLevel> = {};
  const raw = d.stock && typeof d.stock === "object" ? (d.stock as Record<string, DocumentData>) : {};
  for (const [storeId, level] of Object.entries(raw)) {
    stock[storeId] = { physical: num(level?.physical), reserved: num(level?.reserved) };
  }
  return {
    id,
    name: str(d.name),
    categoryId: strOrNull(d.categoryId),
    priceCents: num(d.priceCents),
    archived: Boolean(d.archived),
    stock,
  };
}

export function stockAt(item: Item, storeId: string): StockLevel & { available: number } {
  const level = item.stock[storeId] ?? { physical: 0, reserved: 0 };
  return { ...level, available: Math.max(0, level.physical - level.reserved) };
}

export function toCategory(id: string, d: DocumentData): Category {
  return { id, name: str(d.name), archived: Boolean(d.archived) };
}

export function toCustomer(id: string, d: DocumentData): Customer {
  return { id, name: str(d.name), phone: str(d.phone), notes: str(d.notes) };
}

const MOVEMENT_TYPES: MovementType[] = ["rececao", "transferencia", "ajuste", "levantamento", "anulacao"];

export function toMovement(id: string, d: DocumentData): Movement {
  return {
    id,
    itemId: str(d.itemId),
    itemName: str(d.itemName),
    storeId: str(d.storeId),
    qty: num(d.qty),
    type: MOVEMENT_TYPES.includes(d.type) ? (d.type as MovementType) : "ajuste",
    orderId: strOrNull(d.orderId),
    orderNumber: strOrNull(d.orderNumber),
    reason: strOrNull(d.reason),
    date: str(d.date),
    atMs: toMs(d.at) ?? 0,
    byName: str(d.byName),
  };
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
