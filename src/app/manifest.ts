import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestão de Encomendas",
    short_name: "Encomendas",
    description: "Encomendas, pagamentos em parcelas, stock e levantamentos.",
    start_url: "/",
    display: "standalone",
    background_color: "#EAF0ED",
    theme_color: "#EAF0ED",
    lang: "pt",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
