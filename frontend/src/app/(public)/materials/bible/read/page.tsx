import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { BibleReader } from "@/components/bible-reader";

/**
 * The Bible read in the app, under the shelf it belongs to so a bookmark of the
 * Bible card still finds the reader.
 */
export const metadata = {
  title: "Holy Bible",
  description:
    "Read the whole Bible in the app — World English Bible, all 66 books, chapter by chapter.",
};

export default function BibleReaderPage() {
  return (
    <main className="min-h-screen bg-sand text-bark">
      <section className="px-6 pt-10 lg:px-8">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href="/materials/bible"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-ember hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Bible &amp; EGW</span>
            </Link>
            <Link href="/materials" className="text-xs font-medium text-moss hover:text-ember">
              All study materials
            </Link>
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Holy Bible</h1>
          <p className="mt-2 text-sm text-moss">
            All 66 books, read in the app. Nothing to install, no account, and no other site in the way.
          </p>
        </div>
      </section>

      <section className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="max-w-4xl">
          <BibleReader />
        </div>
      </section>
    </main>
  );
}
