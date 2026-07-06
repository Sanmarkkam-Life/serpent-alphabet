import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Serpent Alphabet",
    short_name: "Serpent",
    description:
      "Learn the Tamil alphabet letter by letter with a friendly snake guide. Trace, pronounce, and master each sound.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5EFDF",
    theme_color: "#2E5B3E",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
