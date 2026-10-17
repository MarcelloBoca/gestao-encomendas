// Leituras usadas pelas páginas. Todas filtram por negócio; filtros por loja e estado são feitos em memória
// para não exigir índices compostos no Firestore.

import { Timestamp } from "firebase-admin/firestore";
import { col, orderFromSnap, toAudit, toCustomer, toPayment, toRefund } from "./repo";
import type { AuditEntry, Customer, Member, Order, Payment, Refund } from "../types";

export async function listOrders(businessId: string, limit = 500): Promise<Order[]> {
  const snap = await col.orders(businessId).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map(orderFromSnap);
}

export async function listOpenOrders(businessId: string): Promise<Order[]> {
  const snap = await col.orders(businessId).where("fulfillment", "in", ["awaiting", "ready"]).get();
  return snap.docs.map(orderFromSnap).sort((a, b) => a.createdAtMs - b.createdAtMs);
}

export async function getOrder(businessId: string, orderId: string): Promise<Order | null> {
  const snap = await col.orders(businessId).doc(orderId).get();
  return snap.exists ? orderFromSnap(snap) : null;
}

export interface OrderBundle {
  order: Order;
  payments: Payment[];
  refunds: Refund[];
  history: AuditEntry[];
}

export async function getOrderBundle(businessId: string, orderId: string): Promise<OrderBundle | null> {
  const [orderSnap, paymentsSnap, refundsSnap, auditSnap] = await Promise.all([
    col.orders(businessId).doc(orderId).get(),
    col.payments(businessId).where("orderId", "==", orderId).get(),
    col.refunds(businessId).where("orderId", "==", orderId).get(),
    col.audit(businessId).where("orderId", "==", orderId).get(),
  ]);
  if (!orderSnap.exists) return null;
  return {
    order: orderFromSnap(orderSnap),
    payments: paymentsSnap.docs.map((d) => toPayment(d.id, d.data())).sort((a, b) => a.createdAtMs - b.createdAtMs),
    refunds: refundsSnap.docs.map((d) => toRefund(d.id, d.data())).sort((a, b) => a.createdAtMs - b.createdAtMs),
    history: auditSnap.docs.map((d) => toAudit(d.id, d.data())).sort((a, b) => b.atMs - a.atMs),
  };
}

export async function getPayment(businessId: string, paymentId: string): Promise<Payment | null> {
  const snap = await col.payments(businessId).doc(paymentId).get();
  return snap.exists ? toPayment(snap.id, snap.data() ?? {}) : null;
}

export async function listCustomers(businessId: string): Promise<Customer[]> {
  const snap = await col.customers(businessId).get();
  return snap.docs.map((d) => toCustomer(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

export async function getCustomerBundle(
  businessId: string,
  customerId: string,
): Promise<{ customer: Customer; orders: Order[] } | null> {
  const [customerSnap, ordersSnap] = await Promise.all([
    col.customers(businessId).doc(customerId).get(),
    col.orders(businessId).where("customerId", "==", customerId).get(),
  ]);
  if (!customerSnap.exists) return null;
  return {
    customer: toCustomer(customerSnap.id, customerSnap.data() ?? {}),
    orders: ordersSnap.docs.map(orderFromSnap).sort((a, b) => b.createdAtMs - a.createdAtMs),
  };
}

export async function paymentsBetween(businessId: string, fromDay: string, toDay: string): Promise<Payment[]> {
  const snap = await col.payments(businessId).where("date", ">=", fromDay).where("date", "<=", toDay).get();
  return snap.docs.map((d) => toPayment(d.id, d.data()));
}

export async function refundsBetween(businessId: string, fromDay: string, toDay: string): Promise<Refund[]> {
  const snap = await col.refunds(businessId).where("date", ">=", fromDay).where("date", "<=", toDay).get();
  return snap.docs.map((d) => toRefund(d.id, d.data()));
}

export async function ordersCreatedSince(businessId: string, sinceMs: number): Promise<Order[]> {
  const snap = await col.orders(businessId).where("createdAt", ">=", Timestamp.fromMillis(sinceMs)).get();
  return snap.docs.map(orderFromSnap);
}

export async function ordersCollectedBetween(businessId: string, fromDay: string, toDay: string): Promise<Order[]> {
  const snap = await col.orders(businessId).where("collectedDate", ">=", fromDay).where("collectedDate", "<=", toDay).get();
  return snap.docs.map(orderFromSnap).filter((o) => o.fulfillment === "collected");
}

export async function auditSince(businessId: string, sinceMs: number): Promise<AuditEntry[]> {
  const snap = await col
    .audit(businessId)
    .where("at", ">=", Timestamp.fromMillis(sinceMs))
    .orderBy("at", "desc")
    .get();
  return snap.docs.map((d) => toAudit(d.id, d.data()));
}

export async function listMembers(businessId: string): Promise<Member[]> {
  const snap = await col.users().where("businessId", "==", businessId).get();
  return snap.docs
    .map((d) => ({
      uid: d.id,
      username: String(d.get("username") ?? ""),
      name: String(d.get("name") ?? ""),
      mustChangePassword: Boolean(d.get("mustChangePassword")),
    }))
    .sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username, "pt"));
}

/** Há pelo menos uma conta com utilizador e palavra-passe? (Antes disso, a entrada mostra o primeiro acesso.) */
export async function hasAnyLogin(): Promise<boolean> {
  const snap = await col.logins().limit(1).get();
  return !snap.empty;
}
