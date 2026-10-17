import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let adminApp: App | undefined;

/** ID do projeto Firebase (público). */
export function firebaseProjectId(): string {
  return (
    cleanEnv(process.env.FIREBASE_PROJECT_ID) ||
    cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) ||
    "gestao-encomendas-2a060"
  );
}

/** Tira espaços e aspas que às vezes ficam ao colar valores no Vercel. */
export function cleanEnv(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim().replace(/^["']/, "").replace(/["']$/, "").trim();
  return trimmed || undefined;
}

let firestore: Firestore | undefined;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0];
    return adminApp;
  }

  const projectId = firebaseProjectId();
  const clientEmail = cleanEnv(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = cleanEnv(process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Configuração do Firebase em falta no servidor: defina FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no Vercel.",
    );
  }

  adminApp = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return adminApp;
}

export function db(): Firestore {
  if (!firestore) {
    firestore = getFirestore(getAdminApp());
    try {
      firestore.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Já configurado nesta instância.
    }
  }
  return firestore;
}

/** Traduz erros de configuração do Firebase numa instrução para quem gere a app; null se não for um desses. */
export function describeFirebaseError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (message.startsWith("Configuração do Firebase")) return message;
  if (code === "app/invalid-credential" || /parse private key|PEM/i.test(message)) {
    return "A chave FIREBASE_PRIVATE_KEY no Vercel não é válida. Cole de novo o valor de private_key do ficheiro JSON, completo, e faça Redeploy.";
  }
  if (/database \(default\) does not exist/i.test(message)) {
    return "A base de dados Firestore ainda não foi criada. No Firebase, abra Firestore Database e carregue em Criar base de dados.";
  }
  if (/Cloud Firestore API has not been used|firestore\.googleapis\.com/i.test(message)) {
    return "A API do Firestore não está ativa neste projeto. Crie a base de dados Firestore no Firebase e tente de novo daqui a alguns minutos.";
  }
  if (/invalid_grant|UNAUTHENTICATED|account not found/i.test(message)) {
    return "O Firebase não aceita as credenciais do servidor. Gere uma nova chave privada (Contas de serviço) e atualize FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no Vercel.";
  }
  if (/incorrect "aud"|incorrect "iss"/i.test(message)) {
    return "A chave do servidor pertence a outro projeto Firebase. Use a conta de serviço do projeto gestao-encomendas-2a060.";
  }
  return null;
}

/** Pede um token de acesso ao Google com a conta de serviço (testa só a chave, sem Firestore nem Auth). */
export async function serviceAccountToken(): Promise<number> {
  const app = getAdminApp();
  const credential = app.options.credential;
  if (!credential) throw new Error("Credencial do Firebase Admin em falta.");
  const token = await credential.getAccessToken();
  return token.expires_in;
}

/** Rejeita se a promessa não terminar a tempo, para mostrar um erro em vez de ficar à espera. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: sem resposta em ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
