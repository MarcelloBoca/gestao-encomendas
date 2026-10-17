import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O Firebase Admin carrega ficheiros e módulos nativos em tempo de execução: não deve ser empacotado.
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore"],
  // Voltar a uma página vista há menos de 30 s é instantâneo; as ações que gravam limpam esta memória.
  experimental: { staleTimes: { dynamic: 30 } },
};

export default nextConfig;
