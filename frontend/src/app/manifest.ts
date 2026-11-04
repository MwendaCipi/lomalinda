import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import { CHURCH } from "@/config/seo";

export const dynamic = "force-static";

/**
 * The manifest, in the second of the two places that serve one.
 *
 * Next answers /manifest.webmanifest from this route, and `public/manifest.json`
 * (the URL older installs stored — see the `manifest` field in layout.tsx) is
 * the other copy. Android mints an installed app's identity from `id` and its
 * icon list, so the two files must agree on both: a copy that drifts makes the
 * launcher hold two versions of the church's app, and the fresh one paints
 * Chrome's own icon until it has re-minted. Keep these fields identical to
 * public/manifest.json.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: CHURCH.name,
    short_name: CHURCH.shortName,
    description: CHURCH.description,
    start_url: "/dashboard",
    id: "/",
    scope: "/",
    display: "standalone",
    background_color: brand.sand,
    // Cream, not bark: the installed app's system bars read this, and a dark
    // theme colour made Chrome draw white glyphs over Android's light
    // three-button band — invisible on a light-mode phone. Cream keeps the
    // glyphs dark where the band is light.
    theme_color: brand.sand,
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/meru/church-crest-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/meru/church-crest-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/meru/church-crest-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Calendar",
        url: "/calendar",
        description: "View church calendar & gatherings",
      },
      {
        name: "Announcements",
        url: "/announcements",
        description: "View latest church announcements",
      },
      {
        name: "Spiritual",
        url: "/spiritual",
        description: "Prayer box, visitation, and child dedication",
      },
    ],
  };
}
