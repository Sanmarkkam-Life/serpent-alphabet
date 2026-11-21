import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TamiLearn",
    short_name: "TamiLearn",
    description:
      "Learn the Tamil alphabet with the Serpent Alphabet: a friendly snake for every letter. Free, offered by Sanmarkkam Life.",
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
