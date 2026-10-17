import { describe, expect, it } from "vitest";
import { hashPassword, isValidUsername, normalizeUsername, validateNewPassword, verifyPassword } from "./password";

describe("palavras-passe", () => {
  it("confirma a palavra-passe certa e recusa a errada", async () => {
    const stored = await hashPassword("sapatos-2026");
    expect(stored.startsWith("s1$")).toBe(true);
    expect(await verifyPassword("sapatos-2026", stored)).toBe(true);
    expect(await verifyPassword("sapatos-2025", stored)).toBe(false);
    expect(await verifyPassword("sapatos-2026", "lixo")).toBe(false);
  });

  it("gera um sal diferente em cada conta", async () => {
    expect(await hashPassword("igual-igual")).not.toBe(await hashPassword("igual-igual"));
  });

  it("exige pelo menos 8 caracteres e confirmação igual", () => {
    expect(() => validateNewPassword("curta")).toThrow();
    expect(() => validateNewPassword("comprida1", "comprida2")).toThrow();
    expect(validateNewPassword("comprida1", "comprida1")).toBe("comprida1");
  });
});

describe("utilizadores", () => {
  it("aceita nomes simples em minúsculas", () => {
    expect(normalizeUsername("  Fatima ")).toBe("fatima");
    expect(isValidUsername("fatima")).toBe(true);
    expect(isValidUsername("ana.m_2")).toBe(true);
  });

  it("recusa nomes curtos, com espaços, acentos ou caminhos", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("ana maria")).toBe(false);
    expect(isValidUsername("fátima")).toBe(false);
    expect(isValidUsername("../x")).toBe(false);
    expect(isValidUsername(".fatima")).toBe(false);
  });
});
