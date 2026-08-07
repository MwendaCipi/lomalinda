"use client";

import Link from "next/link";
import { useState } from "react";
import { fellowshipResources } from "@/config/fellowship-resources";

type HymnalTab = "hymnal" | "nzk";

const hymnals = {
  hymnal: {
    label: "SDA Hymnal",
    title: "SDA Hymnal",
    text: "Search hymns by title, lyrics, category, or number. The online hymnal is also useful for projecting songs during worship.",
    href: fellowshipResources.hymnal,
    button: "Open SDA Hymnal",
  },
  nzk: {
    label: "Nyimbo za Kristo (NZK)",
    title: "Nyimbo za Kristo",
    text: "Browse the Swahili hymn collection for worship, Sabbath School, and personal devotion.",
    href: fellowshipResources.nzk,
    button: "Open Nyimbo za Kristo",
  },
};

export default function HymnalPage() {
  const [tab, setTab] = useState<HymnalTab>("hymnal");
  const hymnal = hymnals[tab];

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pb-10 pt-6 text-[#26352f] sm:py-8 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/share" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]">
          <span>&larr;</span><span>Back to Fellowship</span>
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Hymnal &amp; NZK</h1>

        <section className="mt-6 rounded-3xl border border-[#dfdbd1] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex rounded-2xl bg-[#eef2ed] p-1">
            {(Object.keys(hymnals) as HymnalTab[]).map((item) => (
              <button key={item} type="button" onClick={() => setTab(item)} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === item ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"}`}>
                {hymnals[item].label}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee]/60 p-5 sm:p-7">
            <h2 className="text-2xl font-semibold">{hymnal.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#617068]">{hymnal.text}</p>
            <a href={hymnal.href} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#b36b3c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#96552e]">
              {hymnal.button} <span>&rarr;</span>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
