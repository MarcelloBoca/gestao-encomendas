// Ajudas para as ações: transações com chave única, histórico, movimentos de stock e reservas.

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from "firebase-admin/firestore";
import { db, describeFirebaseError } from "../firebase-admin";
import { UserError, allocateFifo, awaitingKey, fulfillmentFromLines, type WaitingOrder } from "../domain";
import type { ActionState, MovementType, Order, OrderLine } from "../types";
import { col, linesForWrite, orderFromSnap } from "./repo";

/**
 * Corre `fn` numa transação uma única vez por chave. Se a mesma chave voltar (toque repetido, nova tentativa
 * após falha de rede), devolve o resultado guardado sem repetir a operação.
 */
export async function runOnce<T extends DocumentData | null>(
  businessId: string,
  key: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(key)) throw new UserError("Pedido inválido. Atualize a página e tente de novo.");
  const ref = col.idempotency(businessId).doc(key);
  return db().runTransaction(async (tx) => {
    const done = await tx.get(ref);
    if (done.exists) return (done.get("result") ?? null) as T;
    const result = await fn(tx);
    tx.set(ref, { result: result ?? null, at: FieldValue.serverTimestamp() });
    return result;
  });
}

export interface Actor {
  uid: string;
  name: string;
}

export function writeAudit(
  tx: Transaction,
  businessId: string,
  actor: Actor,
  entry: {
    kind: "correcao" | "edicao" | "utilizadores";
    action: string;
    label: string;
    orderId?: string | null;
    orderNumber?: string | null;
    storeId?: string | null;
    reason?: string | null;
    before?: DocumentData | null;
    after?: DocumentData | null;
    key?: string;
  },
): void {
  tx.set(col.audit(businessId).doc(), {
    ...entry,
    orderId: entry.orderId ?? null,
    orderNumber: entry.orderNumber ?? null,
    storeId: entry.storeId ?? null,
    reason: entry.reason ?? null,
    byUid: actor.uid,
    byName: actor.name,
    at: FieldValue.serverTimestamp(),
  });
}

export function writeMovement(
  tx: Transaction,
  businessId: string,
  actor: Actor,
  movement: {
    itemId: string;
    itemName: string;
    storeId: string;
    qty: number;
    type: MovementType;
    date: string;
    orderId?: string | null;
    orderNumber?: string | null;
    transferId?: string | null;
    reason?: string | null;
  },
): void {
  tx.set(col.movements(businessId).doc(), {
    ...movement,
    orderId: movement.orderId ?? null,
    orderNumber: movement.orderNumber ?? null,
    transferId: movement.transferId ?? null,
    reason: movement.reason ?? null,
    byUid: actor.uid,
    byName: actor.name,
    at: FieldValue.serverTimestamp(),
  });
}

export function stockFieldUpdates(storeId: string, physical: number, reserved: number): DocumentData {
  const update: DocumentData = {};
  if (physical !== 0) update[`stock.${storeId}.physical`] = FieldValue.increment(physical);
  if (reserved !== 0) update[`stock.${storeId}.reserved`] = FieldValue.increment(reserved);
  return update;
}

export interface WaitingDoc extends WaitingOrder {
  ref: DocumentReference;
  order: Order;
  changed: boolean;
}

/** Encomendas a aguardar mercadoria numa loja (leitura dentro da transação). */
export async function loadWaiting(tx: Transaction, businessId: string, storeId: string): Promise<WaitingDoc[]> {
  const snap = await tx.get(col.orders(businessId).where("openKey", "==", awaitingKey(storeId)));
  return snap.docs.map((doc) => {
    const order = orderFromSnap(doc);
    return { id: doc.id, ref: doc.ref, order, createdAtMs: order.createdAtMs, lines: order.lines.map((l) => ({ ...l })), changed: false };
  });
}

/**
 * Reserva o disponível de cada artigo para as encomendas em espera (mais antigas primeiro).
 * Devolve quanto foi reservado por artigo e as encomendas que ficaram prontas.
 */
export function allocateToWaiting(
  available: Map<string, number>,
  waiting: WaitingDoc[],
  excludeOrderId?: string,
): { reservedByItem: Map<string, number>; nowReady: WaitingDoc[] } {
  const candidates = waiting.filter((w) => w.id !== excludeOrderId);
  const reservedByItem = new Map<string, number>();
  for (const [itemId, qty] of available) {
    if (qty <= 0) continue;
    const result = allocateFifo(itemId, qty, candidates);
    if (result.allocated > 0) {
      reservedByItem.set(itemId, result.allocated);
      for (const change of result.changes) {
        const doc = candidates.find((c) => c.id === change.orderId);
        if (doc) doc.changed = true;
      }
    }
  }
  const nowReady = candidates.filter((w) => w.changed && fulfillmentFromLines(w.lines) === "ready");
  return { reservedByItem, nowReady };
}

/** Grava as linhas alteradas das encomendas em espera. */
export function writeWaitingChanges(tx: Transaction, waiting: WaitingDoc[], storeId: string): void {
  for (const w of waiting) {
    if (!w.changed) continue;
    const ready = fulfillmentFromLines(w.lines) === "ready";
    tx.update(w.ref, {
      lines: linesForWrite(w.lines),
      fulfillment: ready ? "ready" : "awaiting",
      openKey: ready ? null : awaitingKey(storeId),
      readyAt: ready ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

export function orderStateFields(lines: OrderLine[], storeId: string, wasReady: boolean): DocumentData {
  const ready = fulfillmentFromLines(lines) === "ready";
  const fields: DocumentData = {
    lines: linesForWrite(lines),
    fulfillment: ready ? "ready" : "awaiting",
    openKey: ready ? null : awaitingKey(storeId),
  };
  if (!ready) fields.readyAt = null;
  else if (!wasReady) fields.readyAt = FieldValue.serverTimestamp();
  return fields;
}

export function nowTs(): Timestamp {
  return Timestamp.now();
}

/** Converte erros em mensagens para o formulário. */
export function toActionError(error: unknown): ActionState {
  if (error instanceof UserError) return { error: error.message };
  const setup = describeFirebaseError(error);
  if (setup) return { error: setup };
  console.error(error);
  return { error: "Não foi possível gravar. Verifique a ligação e tente de novo." };
}

// ---------- Leitura de formulários ----------

export function text(fd: FormData, name: string, max = 500): string {
  const value = fd.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function required(fd: FormData, name: string, label: string, max = 500): string {
  const value = text(fd, name, max);
  if (!value) throw new UserError(`${label} é obrigatório.`);
  return value;
}

export function positiveInt(value: unknown, label: string, max = 100_000): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(n) || n <= 0 || n > max) throw new UserError(`${label}: indique um número inteiro maior que zero.`);
  return n;
}
