import type { MetadataRoute } from "next";

export const dynamic = "force-static";

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
      url: "https://www.sdalomalinda.or.ke",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
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
  ];
}
