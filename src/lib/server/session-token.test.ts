import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionToken, readSessionToken } from "./session-token";

const previous = process.env.SESSION_SECRET;
beforeAll(() => {
  process.env.SESSION_SECRET = "segredo-de-teste";
});
afterAll(() => {
  process.env.SESSION_SECRET = previous;
});

describe("sessão assinada", () => {
  const user = { uid: "abc123", email: "ana@exemplo.com", name: "Ana" };

  it("lê de volta uma sessão válida", () => {
    const token = createSessionToken(user, 60_000, 1_000);
    expect(readSessionToken(token, 2_000)).toEqual({ ...user, version: 0 });
    const versioned = createSessionToken({ ...user, version: 3 }, 60_000, 1_000);
    expect(readSessionToken(versioned, 2_000)).toEqual({ ...user, version: 3 });
  });

  it("recusa sessões expiradas", () => {
    const token = createSessionToken(user, 60_000, 1_000);
    expect(readSessionToken(token, 61_001)).toBeNull();
  });

  it("recusa sessões alteradas", () => {
    const token = createSessionToken(user, 60_000, 1_000);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "outro", e: "x@y.z", n: "X", x: 9e15 })).toString("base64url");
    expect(readSessionToken(`${forged}.${sig}`, 2_000)).toBeNull();
    expect(readSessionToken(`${body}.${sig}x`, 2_000)).toBeNull();
    expect(readSessionToken("lixo", 2_000)).toBeNull();
  });

  it("deixa de aceitar sessões quando a chave muda", () => {
    const token = createSessionToken(user, 60_000, 1_000);
    process.env.SESSION_SECRET = "outra-chave";
    expect(readSessionToken(token, 2_000)).toBeNull();
    process.env.SESSION_SECRET = "segredo-de-teste";
  });
});
