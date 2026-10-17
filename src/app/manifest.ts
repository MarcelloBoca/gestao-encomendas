import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sola.chic: Gestão de Loja",
    short_name: "Sola.chic",
    description: "Sistema de Gestão de Loja: encomendas, pagamentos em parcelas e levantamentos.",
    start_url: "/",
    display: "standalone",
    background_color: "#2B1C27",
    theme_color: "#2B1C27",
    lang: "pt",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
