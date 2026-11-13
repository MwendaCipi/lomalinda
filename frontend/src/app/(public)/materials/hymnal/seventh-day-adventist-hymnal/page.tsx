import { HymnalBookPage } from "@/components/hymnal-book-page";
import { HymnalReader } from "@/components/hymnal-reader";
import hymnal from "@/data/seventh-day-adventist-hymnal.json";

/**
 * The English hymnbook, read in the app.
 *
 * The texts go in `src/data/seventh-day-adventist-hymnal.json`, in the same
 * shape as `nyimbo-za-kristo.json` — a hymn number, a title, verses numbered
 * `1`, `2`, `3`, and the chorus lines if the hymn has one. It starts empty on
 * purpose: the 1985 hymnal is a copyrighted compilation, so what belongs here
 * is the texts the church holds rights for, not the whole book. Until the file
 * has hymns, the page sends the reader to the hymnal online.
 */
export const metadata = {
  title: "Seventh-day Adventist Hymnal",
  description:
    "The Seventh-day Adventist Hymnal in English — search by number or title and read the verses.",
};

export default function SeventhDayAdventistHymnalPage() {
  return (
    <HymnalBookPage title="Seventh-day Adventist Hymnal">
      <HymnalReader data={hymnal} storageKey="sda-hymnal:favourites" />
    </HymnalBookPage>
  );
}
