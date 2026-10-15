import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/**
 * The public pages a visitor might search their way to.
 *
 * Only the canonical apex host is listed. The site's own metadata points
 * every canonical at `https://sdalomalinda.or.ke`, so listing the `www` host
 * here as well would invite crawlers to index the same pages twice — the
 * opposite of what a sitemap is for. The about page is the one a stranger
 * looking for a church in Meru is most likely to want, so it leads the
 * second tier.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: "https://sdalomalinda.or.ke",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: "https://sdalomalinda.or.ke/about",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://sdalomalinda.or.ke/calendar",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: "https://sdalomalinda.or.ke/beliefs",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://sdalomalinda.or.ke/give",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://sdalomalinda.or.ke/ministries",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://sdalomalinda.or.ke/materials",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
