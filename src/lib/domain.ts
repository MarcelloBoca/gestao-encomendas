// Regras de negócio puras (sem Firestore), cobertas por testes unitários.

import type { FinancialStatus, OrderLine } from "./types";

/** Erro com mensagem para mostrar ao utilizador. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export function subtotalOf(lines: { priceCents: number; qty: number }[]): number {
  return lines.reduce((sum, line) => sum + line.priceCents * line.qty, 0);
}

export function computeTotals(
  lines: { priceCents: number; qty: number }[],
  discountCents: number,
): { subtotalCents: number; totalCents: number } {
  const subtotalCents = subtotalOf(lines);
  if (discountCents < 0) throw new UserError("O desconto não pode ser negativo.");
  if (discountCents > subtotalCents) throw new UserError("O desconto não pode ser maior que o subtotal.");
  return { subtotalCents, totalCents: subtotalCents - discountCents };
}

export function balanceOf(totalCents: number, paidCents: number): number {
  return Math.max(0, totalCents - paidCents);
}

export function financialStatus(totalCents: number, paidCents: number): FinancialStatus {
  if (totalCents <= 0) return "paid";
  if (paidCents <= 0) return "unpaid";
  if (paidCents < totalCents) return "partial";
  return "paid";
}

export function fulfillmentFromLines(lines: { qty: number; reserved: number }[]): "awaiting" | "ready" {
  return lines.length > 0 && lines.every((line) => line.reserved >= line.qty) ? "ready" : "awaiting";
}

/** Chave usada para encontrar encomendas a aguardar mercadoria numa loja. */
export function awaitingKey(storeId: string): string {
  return `${storeId}|awaiting`;
}

export interface WaitingOrder {
  id: string;
  createdAtMs: number;
  lines: OrderLine[];
}

export interface AllocationChange {
  orderId: string;
  lineId: string;
  qty: number;
}

/**
 * Reserva `available` unidades de um artigo para as encomendas em espera, da mais antiga para a mais recente.
 * Altera `reserved` nas linhas das encomendas recebidas.
 */
export function allocateFifo(
  itemId: string,
  available: number,
  orders: WaitingOrder[],
): { allocated: number; changes: AllocationChange[] } {
  let remaining = Math.max(0, Math.floor(available));
  const changes: AllocationChange[] = [];
  const sorted = [...orders].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));

  for (const order of sorted) {
    if (remaining <= 0) break;
    for (const line of order.lines) {
      if (remaining <= 0) break;
      if (line.itemId !== itemId) continue;
      const need = line.qty - line.reserved;
      if (need <= 0) continue;
      const give = Math.min(need, remaining);
      line.reserved += give;
      remaining -= give;
      changes.push({ orderId: order.id, lineId: line.id, qty: give });
    }
  }

  return { allocated: Math.max(0, Math.floor(available)) - remaining, changes };
}

/** Reserva o stock disponível para linhas novas. `pool` = disponível por artigo; é alterado. */
export function reserveFromPool(lines: OrderLine[], pool: Map<string, number>): void {
  for (const line of lines) {
    const need = line.qty - line.reserved;
    if (need <= 0) continue;
    const available = pool.get(line.itemId) ?? 0;
    const take = Math.min(need, Math.max(0, available));
    line.reserved += take;
    pool.set(line.itemId, available - take);
  }
}

export interface LineInput {
  lineId?: string;
  itemId: string;
  name: string;
  priceCents: number;
  qty: number;
}

/**
 * Aplica a edição das linhas de uma encomenda.
 * Liberta reservas de linhas reduzidas ou removidas, depois reserva do disponível para o que falta.
 * `pool` (disponível por artigo) é alterado e fica com o que sobra para outras encomendas.
 * Devolve as linhas novas e a variação do stock reservado por artigo.
 */
export function editLines(
  oldLines: OrderLine[],
  inputs: LineInput[],
  pool: Map<string, number>,
  newId: () => string,
): { lines: OrderLine[]; reservedDelta: Map<string, number> } {
  const oldById = new Map(oldLines.map((line) => [line.id, line]));
  const kept = new Set<string>();
  const reservedDelta = new Map<string, number>();
  const addDelta = (itemId: string, qty: number) => reservedDelta.set(itemId, (reservedDelta.get(itemId) ?? 0) + qty);
  const release = (itemId: string, qty: number) => {
    if (qty <= 0) return;
    pool.set(itemId, (pool.get(itemId) ?? 0) + qty);
    addDelta(itemId, -qty);
  };

  const lines: OrderLine[] = inputs.map((input) => {
    const old = input.lineId ? oldById.get(input.lineId) : undefined;
    if (!old) {
      return { id: newId(), itemId: input.itemId, name: input.name, priceCents: input.priceCents, qty: input.qty, reserved: 0 };
    }
    kept.add(old.id);
    if (old.itemId !== input.itemId) {
      release(old.itemId, old.reserved);
      return { id: old.id, itemId: input.itemId, name: input.name, priceCents: input.priceCents, qty: input.qty, reserved: 0 };
    }
    const reserved = Math.min(old.reserved, input.qty);
    release(old.itemId, old.reserved - reserved);
    return { id: old.id, itemId: input.itemId, name: input.name, priceCents: input.priceCents, qty: input.qty, reserved };
  });

  for (const old of oldLines) {
    if (!kept.has(old.id)) release(old.itemId, old.reserved);
  }

  for (const line of lines) {
    const need = line.qty - line.reserved;
    if (need <= 0) continue;
    const available = pool.get(line.itemId) ?? 0;
    const take = Math.min(need, Math.max(0, available));
    if (take <= 0) continue;
    line.reserved += take;
    pool.set(line.itemId, available - take);
    addDelta(line.itemId, take);
  }

  return { lines, reservedDelta };
}

/** Quantidades em falta (sem reserva) por artigo numa lista de encomendas em espera. */
export function missingByItem(orders: { lines: { itemId: string; qty: number; reserved: number }[] }[]): Map<string, number> {
  const missing = new Map<string, number>();
  for (const order of orders) {
    for (const line of order.lines) {
      const need = line.qty - line.reserved;
      if (need > 0) missing.set(line.itemId, (missing.get(line.itemId) ?? 0) + need);
    }
  }
  return missing;
}

export function ageBucket(days: number): "0-30" | "31-60" | "60+" {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  return "60+";
}
