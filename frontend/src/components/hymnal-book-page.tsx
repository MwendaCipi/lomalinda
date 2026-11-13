import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The frame every in-app hymnbook shares: the way back to the Hymnals shelf,
 * the way to all study materials, and the book's own name.
 *
 * A member who arrived from the shelf's card and one who arrived from a search
 * both have their exit, which is the same pair of links the Swahili reader has
 * carried since it moved into the app.
 */
export function HymnalBookPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-sand text-bark">
      <section className="px-6 pt-10 lg:px-8">
        <div className="max-w-6xl">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href="/materials/?section=hymnals"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-ember hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to the hymnals</span>
            </Link>
            <Link href="/materials" className="text-xs font-medium text-moss hover:text-ember">
              All study materials
            </Link>
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        </div>
      </section>

      <section className="px-6 py-8 lg:px-8 lg:py-10">
        <div className="max-w-6xl">{children}</div>
      </section>
    </main>
  );
}
