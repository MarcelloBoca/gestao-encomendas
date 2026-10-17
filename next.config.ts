import type { NextConfig } from "next";

const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "gestao-encomendas-2a060";

const nextConfig: NextConfig = {
  // O Firebase Admin carrega ficheiros e módulos nativos em tempo de execução: não deve ser empacotado.
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore"],
  // Permite usar o domínio da própria app como authDomain do Firebase (login por redirecionamento).
  async rewrites() {
    if (!firebaseProjectId) return [];
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${firebaseProjectId}.firebaseapp.com/__/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
