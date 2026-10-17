// Ajudas para as ações: transações com chave única, histórico e leitura de formulários.

import { FieldValue, type DocumentData, type Transaction } from "firebase-admin/firestore";
import { db, describeFirebaseError } from "../firebase-admin";
import { UserError } from "../domain";
import type { ActionState } from "../types";
import { col } from "./repo";

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

