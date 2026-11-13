export const fellowshipResources = {
  bible: "https://www.biblesearch.me/Bible",
  /** The Bible read in the app — its own page, fetched chapter by chapter. */
  bibleReader: "/materials/bible/read",
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
  /**
   * The other hymnbooks, read in the app like the Swahili one. Each page reads
   * its own data file under `src/data/`; the source site each book credits is
   * named in that file.
   */
  sdaHymnalBook: "/materials/hymnal/seventh-day-adventist-hymnal",
  dholuoHymnal: "/materials/hymnal/wende-nyasaye",
  kisiiHymnal: "/materials/hymnal/ogotera-kw-ogotogia-nyasae",
  kikuyuHymnal: "/materials/hymnal/nyimbo-cia-agendi",
} as const;
