import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// The system sections require sign-in and should not appear in search results.
const SYSTEM_SECTIONS = [
  "administration",
  "member",
  "support",
  "financial",
  "community",
  "announcements",
  "spiritual",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: SYSTEM_SECTIONS.map((section) => `/${section}/`),
      },
    ],
  };
}
