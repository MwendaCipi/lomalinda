import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PublicSectionNav } from "@/components/public-section-nav";
import { materialSectionLinks } from "@/config/site-sections";
import { fellowshipResources } from "@/config/fellowship-resources";

export default function BiblePage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <section className="px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/materials"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#b36b3c] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to all materials</span>
          </Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Holy Bible Study</h1>
          <p className="mt-3 max-w-2xl text-base leading-8 text-[#617068]">
            Read, search, and study Holy Scriptures across books, chapters, and translations.
          </p>
        </div>
      </section>

      <section className="px-6 py-12 lg:px-8 lg:py-14">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-10">
          <div className="flex items-center justify-between gap-3">
            <span className="text-4xl" aria-hidden="true">📜</span>
            <span className="rounded-full bg-[#b36b3c]/10 px-3.5 py-1 text-xs font-semibold text-[#b36b3c]">
              Scripture &amp; Word
            </span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Read &amp; Search the Holy Bible</h2>
          <p className="mt-3 text-sm leading-7 text-[#617068]">
            Search books, chapters, parallel translations, and study references for daily personal devotions, family
            altar, and Sabbath School lesson preparation.
          </p>

          <div className="mt-8 flex flex-wrap gap-4 border-t border-[#dfdbd1] pt-6">
            <a
              href={fellowshipResources.bible}
              className="inline-flex items-center gap-2 rounded-full bg-[#26352f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#b36b3c]"
            >
              <span>Launch Online Bible Search</span>
              <span>&rarr;</span>
            </a>
          </div>
        </div>
      </section>

      {/* The old Study Materials sidebar, now part of the page body. */}
      <PublicSectionNav
        eyebrow="Study materials"
        title="More study areas"
        description="Lessons, mission readings, hymns and the Spirit of Prophecy."
        links={materialSectionLinks}
        activeKey="bible-egw"
        className="border-t border-[#dfdbd1] bg-white/60"
      />
    </main>
  );
}
