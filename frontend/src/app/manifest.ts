import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SDA Loma Linda Meru",
    short_name: "SDA Loma Linda Meru",
    description: "A vibrant, English-speaking Seventh-day Adventist church in Meru, Kenya.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4ee",
    theme_color: "#26352f",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
