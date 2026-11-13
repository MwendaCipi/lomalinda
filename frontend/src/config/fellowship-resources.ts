export const fellowshipResources = {
  bible: "https://www.biblesearch.me/Bible",
  egw: "https://egwwritings.org/allCollection/en",
  hymnal: "https://sdahymnals.com/Hymnal/",
  // All 220 Nyimbo za Kristo hymns, searchable by number or title. The old
  // home, nyimbozakristo.com, stopped serving in November 2026 — Vercel answers
  // it with a 402 "DEPLOYMENT_DISABLED", a billing pause on that site's own
  // account — so the Swahili hymnal card points at this collection instead.
  nzk: "https://christinsong.com/nyimbo-za-kristo/",
} as const;
