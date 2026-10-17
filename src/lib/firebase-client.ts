import { getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Configuração pública da app Web do Firebase (não é segredo; o acesso aos dados é controlado no servidor).
// As variáveis NEXT_PUBLIC_FIREBASE_* no Vercel, se existirem, substituem estes valores.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyA5xVz6ArNLWJ5b08mQelFcVDjXY3E7te4",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "gestao-encomendas-2a060.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "gestao-encomendas-2a060",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:39284060206:web:9122aaf8e93daf03ef6fbf",
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.authDomain);

export function clientAuth(): Auth {
  const app = getApps()[0] ?? initializeApp(config);
  return getAuth(app);
}
