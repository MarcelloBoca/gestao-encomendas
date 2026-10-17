import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let adminApp: App | undefined;
let firestore: Firestore | undefined;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0];
    return adminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "gestao-encomendas-2a060";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
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

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}
