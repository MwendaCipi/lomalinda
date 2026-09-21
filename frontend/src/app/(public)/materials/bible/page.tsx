import { Suspense } from "react";
import Link from "next/link";
import { MaterialsSidebar, MaterialsMobileCards } from "@/components/sidebars/materials-sidebar";
import { fellowshipResources } from "@/config/fellowship-resources";
import { ArrowLeft } from "lucide-react";

export default function BiblePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f7f4ee]" />}>
    <main className="min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <MaterialsSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
          {/* Mobile Back Link */}
          <div className="mb-4 lg:hidden">
            <Link
              href="/materials"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#b36b3c] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to All Materials</span>
            </Link>
          </div>
          {/* Mobile section cards (sidebar replacement) */}
          <MaterialsMobileCards />
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Holy Bible Study</h1>
            <p className="mt-2 text-base text-[#617068]">
              Read, search, and study Holy Scriptures across books, chapters, and translations.
            </p>
          </div>

          <div className="mt-6 max-w-3xl rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9">
            <div className="flex items-center justify-between gap-3">
              <span className="text-4xl" aria-hidden="true">📜</span>
              <span className="rounded-full bg-[#b36b3c]/10 px-3.5 py-1 text-xs font-semibold text-[#b36b3c]">
                Scripture &amp; Word
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold sm:text-3xl">Read &amp; Search the Holy Bible</h2>
            <p className="mt-3 text-sm leading-6 text-[#617068]">
              Search books, chapters, parallel translations, and study references for daily personal devotions, family altar, and Sabbath School lesson preparation.
            </p>

            <div className="mt-8 border-t border-[#dfdbd1] pt-6 flex flex-wrap gap-4">
              <a
                href={fellowshipResources.bible}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#26352f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#b36b3c]"
              >
                <span>Launch Online Bible Search</span>
                <span>&rarr;</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
    </Suspense>
  );
}
