import { describe, expect, it } from "vitest";
import { formatCents, parseMoney } from "./money";
import { addDays, daysBetween, isValidIsoDay, isoDay, longDay, startOfDayMs } from "./dates";
import { formatPhone, whatsappNumber } from "./phone";

describe("valores em meticais", () => {
  it("lê os formatos mais comuns", () => {
    expect(parseMoney("4 500,00")).toBe(450000);
    expect(parseMoney("4500")).toBe(450000);
    expect(parseMoney("4.500,5")).toBe(450050);
    expect(parseMoney("120.50")).toBe(12050);
    expect(parseMoney("1.500")).toBe(150000);
    expect(parseMoney("0,99")).toBe(99);
    expect(parseMoney("450,00 MT")).toBe(45000);
  });

  it("recusa texto inválido", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-10")).toBeNull();
    expect(parseMoney("1,234")).toBeNull();
  });

  it("formata com espaço nos milhares e vírgula decimal", () => {
    expect(formatCents(1250000)).toBe("12 500,00");
    expect(formatCents(99)).toBe("0,99");
    expect(formatCents(-100000)).toBe("−1 000,00");
  });
});

describe("datas no fuso de Maputo", () => {
  it("usa o dia local", () => {
    // 23:30 UTC de 16 out já é 17 out em Maputo (UTC+2)
    expect(isoDay(new Date(Date.UTC(2026, 9, 16, 23, 30)), "Africa/Maputo")).toBe("2026-10-17");
  });

  it("calcula a meia-noite local", () => {
    expect(startOfDayMs("2026-10-17", "Africa/Maputo")).toBe(Date.UTC(2026, 9, 16, 22, 0));
  });

  it("conta dias e soma dias", () => {
    expect(daysBetween("2026-09-12", "2026-10-16")).toBe(34);
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(isValidIsoDay("2026-02-30")).toBe(false);
    expect(longDay("2026-10-16")).toBe("Sexta-feira, 16 de outubro");
  });
});

describe("telefones", () => {
  it("formata e prepara para o WhatsApp", () => {
    expect(formatPhone("841234567")).toBe("84 123 4567");
    expect(whatsappNumber("84 123 4567")).toBe("258841234567");
    expect(whatsappNumber("+258 84 123 4567")).toBe("258841234567");
    expect(whatsappNumber("123")).toBeNull();
  });
});
