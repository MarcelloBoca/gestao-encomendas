// Sessão da app num cookie httpOnly assinado com HMAC-SHA256.
// A chave é derivada de SESSION_SECRET ou, se não existir, da chave privada do servidor (nunca sai do servidor).
// Mudar essa chave termina todas as sessões abertas.

import { createHash, createHmac, timingSafeEqual } from "crypto";

export interface SessionPayload {
  uid: string;
  /** Nome de utilizador (nas sessões antigas do Google, o email). */
  email: string;
  name: string;
  /** Versão da sessão: muda quando a palavra-passe muda, o que termina as outras sessões. */
  version?: number;
}

function secret(): string {
  const base = process.env.SESSION_SECRET?.trim() || process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!base) {
    throw new Error("Configuração do Firebase em falta no servidor: defina FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no Vercel.");
  }
  return createHash("sha256").update(`gestao-encomendas:sessao:v1:${base}`).digest("hex");
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createSessionToken(user: SessionPayload, maxAgeMs: number, now: number = Date.now()): string {
  const body = Buffer.from(
    JSON.stringify({ u: user.uid, e: user.email, n: user.name, v: user.version ?? 0, x: now + maxAgeMs }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token: string | undefined | null, now: number = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length) return null;
  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      u?: unknown;
      e?: unknown;
      n?: unknown;
      v?: unknown;
      x?: unknown;
    };
    if (typeof data.u !== "string" || !data.u || typeof data.x !== "number" || data.x <= now) return null;
    const email = typeof data.e === "string" ? data.e : "";
    return {
      uid: data.u,
      email,
      name: typeof data.n === "string" && data.n ? data.n : email,
      version: typeof data.v === "number" ? data.v : 0,
    };
  } catch {
    return null;
  }
}
