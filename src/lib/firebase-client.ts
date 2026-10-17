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

// Domínios da app onde o login do Google passa pelo próprio domínio (/__/auth, reencaminhado para o Firebase).
// Cada um precisa de https://<domínio>/__/auth/handler nos URIs de redirecionamento do cliente OAuth no Google Cloud.
const SAME_ORIGIN_HOSTS = (process.env.NEXT_PUBLIC_AUTH_PROXY_HOSTS || "gestao-encomendas-orpin.vercel.app")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

/**
 * O Safari (e todos os navegadores do iPhone) isola o armazenamento de domínios de terceiros, e a janela de login em
 * firebaseapp.com fica em branco sem conseguir devolver o resultado. Nesses navegadores o login usa o domínio da app.
 */
function usesWebKitStoragePartitioning(): boolean {
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const desktopSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/.test(ua);
  return iOS || desktopSafari;
}

function authDomain(): string {
  if (typeof window === "undefined") return config.authDomain;
  const host = window.location.host;
  return SAME_ORIGIN_HOSTS.includes(host) && usesWebKitStoragePartitioning() ? host : config.authDomain;
}

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.authDomain);

export function clientAuth(): Auth {
  const app = getApps()[0] ?? initializeApp({ ...config, authDomain: authDomain() });
  return getAuth(app);
}
