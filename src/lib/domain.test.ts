import { describe, expect, it } from "vitest";
import { UserError, balanceOf, cleanLines, collectBlockers, financialStatus, greeting, paidPercent, totalOf } from "./domain";
import { axisLabel, niceMax, percentages, periodRange, receivedBuckets } from "./report-series";

describe("totais e estado financeiro", () => {
  it("soma preço × quantidade das linhas", () => {
    expect(totalOf([{ priceCents: 380000, qty: 1 }, { priceCents: 135000, qty: 2 }])).toBe(650000);
    expect(totalOf([])).toBe(0);
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

  it("percentagem paga nunca mostra 100% com saldo em falta", () => {
    expect(paidPercent(900000, 550000)).toBe(61);
    expect(paidPercent(10000, 9999)).toBe(99);
    expect(paidPercent(10000, 10000)).toBe(100);
    expect(paidPercent(0, 0)).toBe(100);
  });
});

describe("levantamento", () => {
  it("bloqueia com saldo em falta e/ou mercadoria por chegar", () => {
    expect(collectBlockers({ totalCents: 1000, paidCents: 500, fulfillment: "awaiting" })).toEqual(["balance", "arrival"]);
    expect(collectBlockers({ totalCents: 1000, paidCents: 1000, fulfillment: "awaiting" })).toEqual(["arrival"]);
    expect(collectBlockers({ totalCents: 1000, paidCents: 500, fulfillment: "ready" })).toEqual(["balance"]);
    expect(collectBlockers({ totalCents: 1000, paidCents: 1000, fulfillment: "ready" })).toEqual([]);
  });
});

describe("artigos escritos à mão", () => {
  it("limpa espaços e mantém o resto", () => {
    expect(cleanLines([{ name: "  Sandália  preta,  nº 38 ", priceCents: 380000, qty: 1 }])).toEqual([
      { name: "Sandália preta, nº 38", priceCents: 380000, qty: 1 },
    ]);
  });

  it("recusa descrição vazia, quantidade inválida ou nenhuma linha", () => {
    expect(() => cleanLines([])).toThrow(UserError);
    expect(() => cleanLines([{ name: "   ", priceCents: 100, qty: 1 }])).toThrow(UserError);
    expect(() => cleanLines([{ name: "Botas", priceCents: 100, qty: 0 }])).toThrow(UserError);
    expect(() => cleanLines([{ name: "Botas", priceCents: -1, qty: 1 }])).toThrow(UserError);
  });
});

describe("saudação", () => {
  it("muda com a hora do dia", () => {
    expect(greeting(8)).toBe("Bom dia");
    expect(greeting(14)).toBe("Boa tarde");
    expect(greeting(21)).toBe("Boa noite");
    expect(greeting(2)).toBe("Boa noite");
  });
});

describe("séries dos relatórios", () => {
  it("semana: 7 dias a terminar hoje, com reembolsos a descontar", () => {
    const today = "2026-10-17"; // sábado
    expect(periodRange("semana", today)).toEqual({ from: "2026-10-11", to: today });
    const buckets = receivedBuckets("semana", today, [
      { date: "2026-10-17", cents: 2130000 },
      { date: "2026-10-12", cents: 980000 },
      { date: "2026-10-12", cents: -50000 },
      { date: "2026-10-01", cents: 999 },
    ]);
    expect(buckets).toHaveLength(7);
    expect(buckets[0].label).toBe("Dom");
    expect(buckets[6].label).toBe("Sáb");
    expect(buckets[6].cents).toBe(2130000);
    expect(buckets[1].cents).toBe(930000);
    expect(buckets.reduce((s, b) => s + b.cents, 0)).toBe(3060000);
  });

  it("3 meses: semanas de 7 dias, a última a terminar hoje", () => {
    const buckets = receivedBuckets("trimestre", "2026-10-17", [{ date: "2026-10-17", cents: 100 }, { date: "2026-07-19", cents: 50 }]);
    expect(buckets).toHaveLength(13);
    expect(buckets[0].from).toBe("2026-07-19");
    expect(buckets[0].cents).toBe(50);
    expect(buckets[12].to).toBe("2026-10-17");
    expect(buckets[12].cents).toBe(100);
  });

  it("topo do eixo redondo e percentagens que somam 100", () => {
    expect(niceMax(2130000)).toBe(3000000);
    expect(axisLabel(3000000)).toBe("30 mil");
    expect(axisLabel(150000)).toBe("1,5 mil");
    expect(axisLabel(80000)).toBe("800");
    expect(niceMax(1000000)).toBe(1000000);
    expect(niceMax(0)).toBe(100000);
    expect(percentages([46, 32, 14, 5, 3])).toEqual([46, 32, 14, 5, 3]);
    expect(percentages([1, 1, 1]).reduce((s, v) => s + v, 0)).toBe(100);
    expect(percentages([0, 0])).toEqual([0, 0]);
  });
});
