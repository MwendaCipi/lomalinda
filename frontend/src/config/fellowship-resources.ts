export const fellowshipResources = {
  bible: "https://www.biblesearch.me/Bible",
  egw: "https://egwwritings.org/allCollection/en",
  hymnal: "https://sdahymnals.com/Hymnal/",
  // All 220 Nyimbo za Kristo hymns, searchable by number or title. The old
  // home, nyimbozakristo.com, stopped serving in November 2026 — Vercel answers
  // it with a 402 "DEPLOYMENT_DISABLED", a billing pause on that site's own
  // account. The hymnbook itself now ships with the app (`nzkHymnbook`), and
  // this link remains as the source the texts are credited to.
  nzk: "https://christinsong.com/nyimbo-za-kristo/",
  /** The Swahili hymnal as the app's own page — the hymnals cards read here. */
  nzkHymnbook: "/materials/hymnal/nyimbo-za-kristo",
  /** Christ in Song hymnals in other languages, opened at their own sites. */
  dholuoHymnal: "https://christinsong.com/wende-nyasaye/",
  kisiiHymnal: "https://christinsong.com/ogotera-kw-ogotogia-nyasae/",
  kikuyuHymnal: "https://christinsong.com/nyimbo-cia-agendi/",
} as const;
