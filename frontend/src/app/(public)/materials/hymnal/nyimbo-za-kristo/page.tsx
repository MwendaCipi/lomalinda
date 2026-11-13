import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { NyimboHymnal } from "@/components/nyimbo-hymnal";

/**
 * The Swahili hymnbook, read in the app rather than on someone else's site.
 *
 * It sits under the hymnal shelf it belongs to (`/materials/hymnal`) so a
 * bookmark of the old deep page still finds it, and carries the way back to
 * that shelf as well as to all materials — a member who arrived from the
 * Hymnals card and one who arrived from a search both have their exit.
 */
export const metadata = {
  title: "Nyimbo za Kristo",
  description:
    "All 220 hymns of Nyimbo za Kristo, the Swahili Seventh-day Adventist hymnal — search by number, title or first line and read the verses.",
};

export default function NyimboZaKristoPage() {
  return (
    <main className="min-h-screen bg-sand text-bark">
      <section className="px-6 pt-10 lg:px-8">
        <div className="max-w-6xl">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href="/materials/hymnal"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-ember hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to the hymnals</span>
            </Link>
            <Link href="/materials" className="text-xs font-medium text-moss hover:text-ember">
              All study materials
            </Link>
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Nyimbo za Kristo</h1>
        </div>
      </section>

      <section className="px-6 py-8 lg:px-8 lg:py-10">
        <div className="max-w-6xl">
          <NyimboHymnal />
        </div>
      </section>
    </main>
  );
}
