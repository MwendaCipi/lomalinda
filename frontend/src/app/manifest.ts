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
    // Cream, not bark: the installed app's system bars read this, and a dark
    // theme colour made Chrome draw white glyphs over Android's light
    // three-button band — invisible on a light-mode phone. Cream keeps the
    // glyphs dark where the band is light.
    theme_color: brand.sand,
    icons: [
      {
        src: "/icons/meru/church-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/meru/church-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/meru/church-icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
