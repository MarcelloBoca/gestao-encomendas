import { NextResponse } from "next/server";
import { adminAuth, db, describeFirebaseError } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Check {
  ok: boolean;
  ms: number;
  detalhe?: string;
  erro?: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: sem resposta em ${ms / 1000}s`)), ms)),
  ]);
}

async function run(label: string, fn: () => Promise<string | void>): Promise<Check> {
  const start = Date.now();
  try {
    const detalhe = await withTimeout(fn(), 10_000, label);
    return { ok: true, ms: Date.now() - start, ...(detalhe ? { detalhe } : {}) };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    return {
      ok: false,
      ms: Date.now() - start,
      detalhe: describeFirebaseError(error) ?? undefined,
      erro: `${code ? `[${code}] ` : ""}${raw}`.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[chave]").slice(0, 300),
    };
  }
}

/** Verifica a configuração do servidor sem mostrar segredos. Não precisa de sessão. */
export async function GET() {
  const configuracao = {
    FIREBASE_CLIENT_EMAIL: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    FIREBASE_PRIVATE_KEY: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    chaveComCabecalho: /BEGIN PRIVATE KEY/.test(process.env.FIREBASE_PRIVATE_KEY ?? ""),
    chaveComQuebrasEscapadas: (process.env.FIREBASE_PRIVATE_KEY ?? "").includes("\\n"),
    chaveComAspas: /^\s*"/.test(process.env.FIREBASE_PRIVATE_KEY ?? ""),
  };
  const credenciais = await run("Credenciais", async () => {
    const result = await adminAuth().listUsers(1);
    return `${result.users.length} utilizador(es) lido(s) no Firebase Authentication`;
  });
  const firestore = await run("Firestore", async () => {
    const snap = await db().collection("_saude").doc("ping").get();
    return snap.exists ? "documento de teste encontrado" : "base de dados acessível";
  });
  return NextResponse.json(
    { configuracao, credenciais, firestore },
    { headers: { "Cache-Control": "no-store" } },
  );
}
