// Verificação do token de login do Firebase (Google) sem firebase-admin/auth, que não carrega no Vercel.
// Segue as regras publicadas pelo Firebase: assinatura RS256 com os certificados públicos da Google,
// emissor e audiência do projeto, e datas válidas.

import { X509Certificate, verify } from "crypto";

const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const CLOCK_SKEW_S = 300;

let cache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function googleCerts(force = false): Promise<Record<string, string>> {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.certs;
  const response = await fetch(CERTS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Não foi possível obter os certificados da Google (${response.status}).`);
  const certs = (await response.json()) as Record<string, string>;
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1] ?? "3600");
  cache = { certs, expiresAt: Date.now() + Math.min(maxAge, 6 * 3600) * 1000 };
  return certs;
}

function decodePart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
}

export interface VerifiedIdToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  authTime: number;
}

export class InvalidIdTokenError extends Error {
  constructor(reason: string) {
    super(`Token de login inválido: ${reason}`);
    this.name = "InvalidIdTokenError";
  }
}

export async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<VerifiedIdToken> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new InvalidIdTokenError("formato");
  const [headerPart, payloadPart, signaturePart] = parts;

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = decodePart(headerPart);
    payload = decodePart(payloadPart);
  } catch {
    throw new InvalidIdTokenError("conteúdo ilegível");
  }
  if (header.alg !== "RS256" || !header.kid) throw new InvalidIdTokenError("algoritmo");

  let certs = await googleCerts();
  if (!certs[header.kid]) certs = await googleCerts(true);
  const pem = certs[header.kid];
  if (!pem) throw new InvalidIdTokenError("certificado desconhecido");

  const publicKey = new X509Certificate(pem).publicKey;
  const signature = Buffer.from(signaturePart, "base64url");
  const valid = verify("RSA-SHA256", Buffer.from(`${headerPart}.${payloadPart}`), publicKey, signature);
  if (!valid) throw new InvalidIdTokenError("assinatura");

  const now = Math.floor(Date.now() / 1000);
  const num = (v: unknown) => (typeof v === "number" ? v : NaN);
  if (payload.aud !== projectId) throw new InvalidIdTokenError("projeto (aud)");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new InvalidIdTokenError("emissor (iss)");
  if (!(num(payload.exp) > now - CLOCK_SKEW_S)) throw new InvalidIdTokenError("expirado");
  if (!(num(payload.iat) <= now + CLOCK_SKEW_S)) throw new InvalidIdTokenError("emitido no futuro");
  if (!(num(payload.auth_time) <= now + CLOCK_SKEW_S)) throw new InvalidIdTokenError("hora do login");
  const uid = typeof payload.sub === "string" ? payload.sub : "";
  if (!uid || uid.length > 128) throw new InvalidIdTokenError("utilizador (sub)");

  const email = typeof payload.email === "string" ? payload.email : "";
  return {
    uid,
    email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" && payload.name ? payload.name : email,
    authTime: num(payload.auth_time),
  };
}

/** Testa o acesso aos certificados (usado no diagnóstico). */
export async function certificateCount(): Promise<number> {
  return Object.keys(await googleCerts(true)).length;
}
