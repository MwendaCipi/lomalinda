import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import { CHURCH } from "@/config/seo";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: CHURCH.name,
    short_name: CHURCH.shortName,
    description: CHURCH.description,
    start_url: "/dashboard",
    display: "standalone",
    background_color: brand.sand,
    theme_color: brand.bark,
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
