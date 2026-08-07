"use client";

import Link from "next/link";
import { useState } from "react";
import { fellowshipResources } from "@/config/fellowship-resources";

type ResourceTab = "bible" | "egw";

const resources = {
  bible: {
    label: "Bible",
    title: "Read the Bible",
    text: "Search books, chapters, and Bible versions for personal study.",
    href: fellowshipResources.bible,
    button: "Open Bible",
  },
  egw: {
    label: "EGW Writings",
    title: "Ellen G. White Writings",
    text: "Explore the writings of Ellen G. White through the online collection.",
    href: fellowshipResources.egw,
    button: "Open EGW Library",
  },
};

export default function BibleSopPage() {
  const [tab, setTab] = useState<ResourceTab>("bible");
  const resource = resources[tab];

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pb-10 pt-6 text-[#26352f] sm:py-8 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/share" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]">
          <span>&larr;</span><span>Back to Fellowship</span>
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Bible &amp; EGW Writings</h1>
        <section className="mt-6 rounded-3xl border border-[#dfdbd1] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex rounded-2xl bg-[#eef2ed] p-1">
            {(Object.keys(resources) as ResourceTab[]).map((item) => (
              <button key={item} type="button" onClick={() => setTab(item)} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === item ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"}`}>
                {resources[item].label}
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee]/60 p-5 sm:p-7">
            <h2 className="text-2xl font-semibold">{resource.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#617068]">{resource.text}</p>
            <a href={resource.href} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#b36b3c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#96552e]">
              {resource.button} <span>&rarr;</span>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
