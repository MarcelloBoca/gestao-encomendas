import { describe, expect, it } from "vitest";
import {
  UserError,
  allocateFifo,
  balanceOf,
  computeTotals,
  editLines,
  financialStatus,
  fulfillmentFromLines,
  missingByItem,
  reserveFromPool,
  type WaitingOrder,
} from "./domain";
import type { OrderLine } from "./types";

const line = (id: string, itemId: string, qty: number, reserved = 0, priceCents = 1000): OrderLine => ({
  id,
  itemId,
  name: itemId,
  priceCents,
  qty,
  reserved,
});

describe("totais e estado financeiro", () => {
  it("calcula subtotal, desconto e total", () => {
    const totals = computeTotals([line("a", "x", 1, 0, 980000), line("b", "y", 2, 0, 135000)], 0);
    expect(totals).toEqual({ subtotalCents: 1250000, totalCents: 1250000 });
    expect(computeTotals([line("a", "x", 2, 0, 5000)], 1000).totalCents).toBe(9000);
  });

  it("recusa desconto maior que o subtotal ou negativo", () => {
    expect(() => computeTotals([line("a", "x", 1, 0, 5000)], 6000)).toThrow(UserError);
    expect(() => computeTotals([line("a", "x", 1, 0, 5000)], -1)).toThrow(UserError);
  });

  it("parcela de 40 em 100 deixa saldo 60 e parcialmente paga", () => {
    expect(balanceOf(10000, 4000)).toBe(6000);
    expect(financialStatus(10000, 4000)).toBe("partial");
  });

  it("sem pagamentos está por pagar; saldo zero está paga", () => {
    expect(financialStatus(10000, 0)).toBe("unpaid");
    expect(financialStatus(10000, 10000)).toBe("paid");
    expect(balanceOf(10000, 12000)).toBe(0);
  });
});

describe("estado de cumprimento", () => {
  it("só fica pronta quando todas as linhas estão reservadas", () => {
    expect(fulfillmentFromLines([line("a", "x", 2, 2), line("b", "y", 1, 0)])).toBe("awaiting");
    expect(fulfillmentFromLines([line("a", "x", 2, 2), line("b", "y", 1, 1)])).toBe("ready");
    expect(fulfillmentFromLines([])).toBe("awaiting");
  });
});

describe("reserva pela ordem das encomendas", () => {
  const orders = (): WaitingOrder[] => [
    { id: "B", createdAtMs: 2000, lines: [line("b1", "almofada", 2)] },
    { id: "A", createdAtMs: 1000, lines: [line("a1", "almofada", 2)] },
  ];

  it("a encomenda mais antiga recebe primeiro", () => {
    const list = orders();
    const result = allocateFifo("almofada", 2, list);
    expect(result.allocated).toBe(2);
    expect(list.find((o) => o.id === "A")!.lines[0].reserved).toBe(2);
    expect(list.find((o) => o.id === "B")!.lines[0].reserved).toBe(0);
  });

  it("reserva parcial na encomenda seguinte quando sobra", () => {
    const list = orders();
    const result = allocateFifo("almofada", 3, list);
    expect(result.allocated).toBe(3);
    expect(list.find((o) => o.id === "B")!.lines[0].reserved).toBe(1);
  });

  it("não reserva mais do que o necessário", () => {
    const list = orders();
    const result = allocateFifo("almofada", 10, list);
    expect(result.allocated).toBe(4);
  });

  it("ignora outros artigos", () => {
    const list = orders();
    expect(allocateFifo("fogao", 5, list).allocated).toBe(0);
  });

  it("nova encomenda reserva do disponível", () => {
    const lines = [line("n1", "colchao", 1), line("n2", "almofada", 2)];
    const pool = new Map([["colchao", 2]]);
    reserveFromPool(lines, pool);
    expect(lines[0].reserved).toBe(1);
    expect(lines[1].reserved).toBe(0);
    expect(pool.get("colchao")).toBe(1);
  });
});

describe("edição de linhas", () => {
  let counter = 0;
  const newId = () => `novo${++counter}`;

  it("reduzir a quantidade liberta a reserva", () => {
    const pool = new Map<string, number>();
    const { lines, reservedDelta } = editLines([line("a", "x", 3, 3)], [{ lineId: "a", itemId: "x", name: "x", priceCents: 1000, qty: 1 }], pool, newId);
    expect(lines[0].reserved).toBe(1);
    expect(pool.get("x")).toBe(2);
    expect(reservedDelta.get("x")).toBe(-2);
  });

  it("aumentar a quantidade reserva do disponível", () => {
    const pool = new Map([["x", 1]]);
    const { lines, reservedDelta } = editLines([line("a", "x", 1, 1)], [{ lineId: "a", itemId: "x", name: "x", priceCents: 1000, qty: 3 }], pool, newId);
    expect(lines[0].reserved).toBe(2);
    expect(pool.get("x")).toBe(0);
    expect(reservedDelta.get("x")).toBe(1);
  });

  it("remover uma linha liberta tudo e uma linha nova reserva", () => {
    const pool = new Map([["y", 5]]);
    const { lines, reservedDelta } = editLines(
      [line("a", "x", 2, 2)],
      [{ itemId: "y", name: "y", priceCents: 500, qty: 2 }],
      pool,
      newId,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].reserved).toBe(2);
    expect(pool.get("x")).toBe(2);
    expect(reservedDelta.get("x")).toBe(-2);
    expect(reservedDelta.get("y")).toBe(2);
  });

  it("conta as quantidades em falta por artigo", () => {
    const missing = missingByItem([{ lines: [line("a", "x", 3, 1), line("b", "y", 2, 2)] }, { lines: [line("c", "x", 1, 0)] }]);
    expect(missing.get("x")).toBe(3);
    expect(missing.has("y")).toBe(false);
  });
});
