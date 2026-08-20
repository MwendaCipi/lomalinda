"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { fellowshipResources } from "@/config/fellowship-resources";

type MaterialTab = "hymnal" | "nzk" | "bible" | "egw";

const materials: Record<
  MaterialTab,
  {
    label: string;
    title: string;
    description: string;
    href: string;
    button: string;
    badge: string;
    icon: string;
  }
> = {
  hymnal: {
    label: "SDA Hymnal",
    title: "Seventh-day Adventist Hymnal",
    description: "Search hymns by title, lyrics, category, or hymn number. Ideal for personal worship, choir preparation, and church song services.",
    href: fellowshipResources.hymnal,
    button: "Open SDA Hymnal",
    badge: "English Hymns",
    icon: "🎵",
  },
  nzk: {
    label: "Nyimbo za Kristo (NZK)",
    title: "Nyimbo za Kristo",
    description: "Browse the complete Swahili hymnbook collection for Sabbath School, vespers, family devotions, and worship praise.",
    href: fellowshipResources.nzk,
    button: "Open Nyimbo za Kristo",
    badge: "Swahili Hymns",
    icon: "🎶",
  },
  bible: {
    label: "Holy Bible",
    title: "Read & Study the Bible",
    description: "Search books, chapters, parallel translations, and study references for daily personal study and Sabbath School preparation.",
    href: fellowshipResources.bible,
    button: "Open Bible",
    badge: "Scripture",
    icon: "📖",
  },
  egw: {
    label: "EGW Writings",
    title: "Ellen G. White Writings",
    description: "Explore the complete writings, devotionals, commentaries, and Spirit of Prophecy books of Ellen G. White through the official online library.",
    href: fellowshipResources.egw,
    button: "Open EGW Library",
    badge: "Spirit of Prophecy",
    icon: "📜",
  },
};

function MaterialsContent() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") as MaterialTab | null;
  const initialTab: MaterialTab = rawTab && materials[rawTab] ? rawTab : "hymnal";

  const [tab, setTab] = useState<MaterialTab>(initialTab);
  const current = materials[tab];

  useEffect(() => {
    if (rawTab && materials[rawTab]) {
      setTab(rawTab);
    }
  }, [rawTab]);

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pb-10 pt-6 text-[#26352f] sm:py-8 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/share"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Fellowship</span>
        </Link>

        <div className="mt-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Materials</h1>
          <p className="mt-2 text-base text-[#617068]">
            Access worship hymnals, Holy Scriptures, and Ellen G. White writings in one place.
          </p>
        </div>

        <section className="mt-6 rounded-3xl border border-[#dfdbd1] bg-white p-5 shadow-sm sm:p-8">
          {/* 4 Toggles */}
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[#eef2ed] p-1 sm:grid-cols-4">
            {(Object.keys(materials) as MaterialTab[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-xl px-3 py-2.5 text-center text-xs font-semibold transition sm:text-sm ${
                  tab === key ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"
                }`}
              >
                {materials[key].label}
              </button>
            ))}
          </div>

          {/* Active Material Card */}
          <div className="mt-6 rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee]/60 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden="true">
                {current.icon}
              </span>
              <div>
                <span className="inline-block rounded-full bg-[#b36b3c]/10 px-3 py-0.5 text-xs font-semibold text-[#b36b3c]">
                  {current.badge}
                </span>
                <h2 className="mt-1 text-2xl font-semibold">{current.title}</h2>
              </div>
            </div>

            <p className="mt-4 text-sm leading-7 text-[#617068] sm:text-base">{current.description}</p>

            <a
              href={current.href}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#b36b3c] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#96552e]"
            >
              <span>{current.button}</span>
              <span>&rarr;</span>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function MaterialsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">
          Loading materials...
        </main>
      }
    >
      <MaterialsContent />
    </Suspense>
  );
}
