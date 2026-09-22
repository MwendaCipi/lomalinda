import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Loma Linda SDA",
    short_name: "Loma Linda SDA",
    description: "A vibrant, English-speaking Seventh-day Adventist church in Meru, Kenya.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f4ee",
    theme_color: "#26352f",
    icons: [
      {
        src: "/icons/meru/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/meru/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/meru/app-icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
