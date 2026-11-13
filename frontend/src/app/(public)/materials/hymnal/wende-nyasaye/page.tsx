import { HymnalBookPage } from "@/components/hymnal-book-page";
import { HymnalReader } from "@/components/hymnal-reader";
import hymnal from "@/data/wende-nyasaye.json";

/**
 * The Dholuo hymnbook, read in the app.
 *
 * The page is wired and waits on its texts: `src/data/wende-nyasaye.json` is
 * where they go, in the same shape as `nyimbo-za-kristo.json` — a hymn number,
 * a title, verses numbered `1`, `2`, `3`, and the chorus lines if the hymn has
 * one. Until that file has hymns, the page says the book is being prepared
 * rather than showing an empty index.
 */
export const metadata = {
  title: "Wende Nyasaye",
  description:
    "Wende Nyasaye, the Dholuo Seventh-day Adventist hymnbook — search by number or title and read the verses.",
};

export default function WendeNyasayePage() {
  return (
    <HymnalBookPage title="Wende Nyasaye">
      <HymnalReader data={hymnal} storageKey="wende-nyasaye:favourites" />
    </HymnalBookPage>
  );
}
