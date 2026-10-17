import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Check {
  ok: boolean;
  ms: number;
  detalhe?: string;
  erro?: string;
}

function errorText(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  return `${code ? `[${code}] ` : ""}${raw}`.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[chave]").slice(0, 400);
}

function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: sem resposta em ${ms / 1000} s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function run(label: string, fn: () => Promise<string>): Promise<Check> {
  const start = Date.now();
  try {
    const detalhe = await timeout(fn(), 6_000, label);
    return { ok: true, ms: Date.now() - start, detalhe };
  } catch (error) {
    let detalhe: string | undefined;
    try {
      const { describeFirebaseError } = await import("@/lib/firebase-admin");
      detalhe = describeFirebaseError(error) ?? undefined;
    } catch {
      detalhe = undefined;
    }
    return { ok: false, ms: Date.now() - start, detalhe, erro: errorText(error) };
  }
}

/** Verifica a configuração do servidor sem mostrar segredos. Não precisa de sessão. */
export async function GET() {
  const key = process.env.FIREBASE_PRIVATE_KEY ?? "";
  const email = process.env.FIREBASE_CLIENT_EMAIL ?? "";
  const configuracao = {
    node: process.version,
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

  // Carregar cada parte em separado mostra qual falha, se o problema for a própria biblioteca.
  const modulos = {
    app: await run("firebase-admin/app", async () => Object.keys(await import("firebase-admin/app")).length + " exportações"),
    auth: await run("firebase-admin/auth", async () => Object.keys(await import("firebase-admin/auth")).length + " exportações"),
    firestore: await run("firebase-admin/firestore", async () => Object.keys(await import("firebase-admin/firestore")).length + " exportações"),
  };

  const [token, credenciais, firestore] = await Promise.all([
    run("Token Google", async () => {
      const { serviceAccountToken } = await import("@/lib/firebase-admin");
      return `token válido por ${await serviceAccountToken()} s`;
    }),
    run("Authentication", async () => {
      const { adminAuth } = await import("@/lib/firebase-admin");
      const result = await adminAuth().listUsers(1);
      return `${result.users.length} utilizador(es) lido(s)`;
    }),
    run("Firestore", async () => {
      const { db } = await import("@/lib/firebase-admin");
      const snap = await db().collection("_saude").doc("ping").get();
      return snap.exists ? "documento de teste encontrado" : "base de dados acessível";
    }),
  ]);

  return NextResponse.json(
    { configuracao, modulos, token, credenciais, firestore },
    { headers: { "Cache-Control": "no-store" } },
  );
}
