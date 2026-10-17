import { NextResponse } from "next/server";
import { cleanEnv, db, describeFirebaseError, firebaseProjectId, serviceAccountToken, withTimeout } from "@/lib/firebase-admin";
import { certificateCount } from "@/lib/server/id-token";

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
    const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    return {
      ok: false,
      ms: Date.now() - start,
      detalhe: describeFirebaseError(error) ?? undefined,
      erro: `${code ? `[${code}] ` : ""}${raw}`.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[chave]").slice(0, 400),
    };
  }
}

/** Verifica a configuração do servidor sem mostrar segredos. Não precisa de sessão. */
export async function GET() {
  const key = process.env.FIREBASE_PRIVATE_KEY ?? "";
  const rawEmail = process.env.FIREBASE_CLIENT_EMAIL ?? "";
  const email = cleanEnv(rawEmail) ?? "";
  const projectId = firebaseProjectId();
  const configuracao = {
    node: process.version,
    projeto: projectId,
    emailDefinido: Boolean(email),
    dominioDoEmail: email.includes("@") ? email.slice(email.indexOf("@") + 1) : "(sem @)",
    emailDoProjeto: email.endsWith(`@${projectId}.iam.gserviceaccount.com`),
    emailComEspacosOuAspas: rawEmail !== email,
    chaveDefinida: Boolean(key),
    chaveComCabecalho: key.includes("BEGIN PRIVATE KEY"),
    chaveComRodape: key.includes("END PRIVATE KEY"),
    chaveComQuebrasEscapadas: key.includes("\\n"),
    chaveComQuebrasReais: key.includes("\n"),
    chaveComAspas: /^\s*["']/.test(key),
    tamanhoDaChave: key.length,
  };
  const [certificados, token, firestore] = await Promise.all([
    run("Certificados Google", async () => `${await certificateCount()} certificados de login obtidos`),
    run("Token Google", async () => `token da conta de serviço válido por ${await serviceAccountToken()} s`),
    run("Firestore", async () => {
      const snap = await db().collection("_saude").doc("ping").get();
      return snap.exists ? "documento de teste encontrado" : "base de dados acessível";
    }),
  ]);
  return NextResponse.json({ configuracao, certificados, token, firestore }, { headers: { "Cache-Control": "no-store" } });
}
