// Regras de negócio puras (sem Firestore), cobertas por testes unitários.

import type { FinancialStatus, Fulfillment } from "./types";

/** Erro com mensagem para mostrar ao utilizador. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export function totalOf(lines: { priceCents: number; qty: number }[]): number {
  return lines.reduce((sum, line) => sum + line.priceCents * line.qty, 0);
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

/** Percentagem paga, de 0 a 100 (arredondada para baixo, para não mostrar 100% com saldo em falta). */
export function paidPercent(totalCents: number, paidCents: number): number {
  if (totalCents <= 0) return 100;
  return Math.max(0, Math.min(100, Math.floor((paidCents / totalCents) * 100)));
}

export function isOpen(fulfillment: Fulfillment): boolean {
  return fulfillment === "awaiting" || fulfillment === "ready";
}

export type CollectBlocker = "balance" | "arrival";

/** O que ainda impede o levantamento: saldo em falta e/ou mercadoria por chegar. */
export function collectBlockers(order: { totalCents: number; paidCents: number; fulfillment: Fulfillment }): CollectBlocker[] {
  const blockers: CollectBlocker[] = [];
  if (balanceOf(order.totalCents, order.paidCents) > 0) blockers.push("balance");
  if (order.fulfillment === "awaiting") blockers.push("arrival");
  return blockers;
}

export interface LineInput {
  lineId?: string;
  name: string;
  priceCents: number;
  qty: number;
}

/** Limpa e valida as linhas escritas à mão. Lança UserError com a primeira falha. */
export function cleanLines(inputs: LineInput[]): LineInput[] {
  if (inputs.length === 0) throw new UserError("Adicione pelo menos um artigo.");
  if (inputs.length > 60) throw new UserError("Demasiados artigos numa encomenda.");
  return inputs.map((input, index) => {
    const name = input.name.replace(/\s+/g, " ").trim().slice(0, 160);
    if (!name) throw new UserError(`Escreva a descrição do artigo ${index + 1}.`);
    if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > 10_000) {
      throw new UserError(`A quantidade do artigo ${index + 1} tem de ser um número inteiro de 1 a 10 000.`);
    }
    if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
      throw new UserError(`O preço do artigo ${index + 1} não é válido.`);
    }
    return { ...input, name };
  });
}

export function ageBucket(days: number): "0-30" | "31-60" | "60+" {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  return "60+";
}

/** "Bom dia" das 5h às 12h, "Boa tarde" até às 19h, depois "Boa noite". */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 19) return "Boa tarde";
  return "Boa noite";
}
