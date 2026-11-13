import { HymnalBookPage } from "@/components/hymnal-book-page";
import { HymnalReader } from "@/components/hymnal-reader";
import hymnal from "@/data/nyimbo-cia-agendi.json";

/**
 * The Kikuyu hymnbook, read in the app.
 *
 * The texts go in `src/data/nyimbo-cia-agendi.json`, in the same shape as
 * `nyimbo-za-kristo.json`. Until that file has hymns, the page says the book is
 * being prepared rather than showing an empty index.
 */
export const metadata = {
  title: "Nyimbo cia Agendi",
  description:
    "Nyimbo cia Agendi, the Kikuyu Seventh-day Adventist hymnbook — search by number or title and read the verses.",
};

export default function NyimboCiaAgendiPage() {
  return (
    <HymnalBookPage title="Nyimbo cia Agendi">
      <HymnalReader data={hymnal} storageKey="nyimbo-cia-agendi:favourites" />
    </HymnalBookPage>
  );
}
