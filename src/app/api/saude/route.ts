import { NextResponse } from "next/server";
import { adminAuth, db, describeFirebaseError, serviceAccountToken, withTimeout } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Check {
  ok: boolean;
  ms: number;
  detalhe?: string;
  erro?: string;
}

async function run(label: string, fn: () => Promise<string>): Promise<Check> {
  const start = Date.now();
  try {
    const detalhe = await withTimeout(fn(), 6_000, label);
    return { ok: true, ms: Date.now() - start, detalhe };
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
  const key = process.env.FIREBASE_PRIVATE_KEY ?? "";
  const email = process.env.FIREBASE_CLIENT_EMAIL ?? "";
  const configuracao = {
    emailDefinido: Boolean(email),
    emailDoProjeto: email.endsWith("@gestao-encomendas-2a060.iam.gserviceaccount.com"),
    chaveDefinida: Boolean(key),
    chaveComCabecalho: key.includes("BEGIN PRIVATE KEY"),
    chaveComRodape: key.includes("END PRIVATE KEY"),
    chaveComQuebrasEscapadas: key.includes("\\n"),
    chaveComQuebrasReais: key.includes("\n"),
    chaveComAspas: /^\s*["']/.test(key),
    tamanhoDaChave: key.length,
  };
  const [token, credenciais, firestore] = await Promise.all([
    run("Token Google", async () => `token válido por ${await serviceAccountToken()} s`),
    run("Authentication", async () => {
      const result = await adminAuth().listUsers(1);
      return `${result.users.length} utilizador(es) lido(s)`;
    }),
    run("Firestore", async () => {
      const snap = await db().collection("_saude").doc("ping").get();
      return snap.exists ? "documento de teste encontrado" : "base de dados acessível";
    }),
  ]);
  return NextResponse.json({ configuracao, token, credenciais, firestore }, { headers: { "Cache-Control": "no-store" } });
}
