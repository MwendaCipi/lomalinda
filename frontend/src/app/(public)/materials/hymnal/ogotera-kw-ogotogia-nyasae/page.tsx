import { HymnalBookPage } from "@/components/hymnal-book-page";
import { HymnalReader } from "@/components/hymnal-reader";
import hymnal from "@/data/ogotera-kw-ogotogia-nyasae.json";

/**
 * The Ekegusii (Kisii) hymnbook, read in the app.
 *
 * The texts go in `src/data/ogotera-kw-ogotogia-nyasae.json`, in the same shape
 * as `nyimbo-za-kristo.json`. Until that file has hymns, the page says the book
 * is being prepared rather than showing an empty index.
 */
export const metadata = {
  title: "Ogotera kw'ogotogia Nyasae",
  description:
    "Ogotera kw'ogotogia Nyasae, the Ekegusii Seventh-day Adventist hymnbook — search by number or title and read the verses.",
};

export default function OgoteraPage() {
  return (
    <HymnalBookPage title="Ogotera kw'ogotogia Nyasae">
      <HymnalReader data={hymnal} storageKey="ogotera-kw-ogotogia-nyasae:favourites" />
    </HymnalBookPage>
  );
}
