"use client";

import Link from "next/link";
import { useState } from "react";

const programmes = [
  { type: "sabbath", label: "Sabbath Worship Service", date: "3 Aug 2026", time: "8:00 AM", emoji: "🎵" },
  { type: "vespers", label: "Friday Vespers", date: "1 Aug 2026", time: "5:30 PM", emoji: "🌅" },
  { type: "midweek", label: "Midweek Vespers", date: "30 Jul 2026", time: "8:00 PM", emoji: "🕯️" },
  { type: "sabbath", label: "Sabbath Worship Service", date: "27 Jul 2026", time: "8:00 AM", emoji: "🎵" },
  { type: "special", label: "Special Programme – Youth Sunday", date: "20 Jul 2026", time: "10:00 AM", emoji: "⭐" },
  { type: "vespers", label: "Friday Vespers", date: "18 Jul 2026", time: "5:30 PM", emoji: "🌅" },
];

type Filter = "all" | "sabbath" | "vespers" | "midweek" | "special";

export default function LiveServicesPage() {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = programmes.filter((p) => filter === "all" || p.type === filter);

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-10 pb-16 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/share"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Fellowship</span>
        </Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">
              Fellowship
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">
              Live Services
            </h1>
            <p className="mt-3 text-base leading-7 text-[#617068]">
              Watch or catch up on Sabbath worship, vespers, and special programmes from Loma Linda.
            </p>
          </div>

          {/* Live badge */}
          <span className="flex items-center gap-1.5 rounded-full border border-[#b36b3c]/30 bg-white px-4 py-2 text-sm font-semibold text-[#b36b3c] shadow-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#b36b3c] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#b36b3c]" />
            </span>
            Live
          </span>
        </div>

        {/* Filter tabs */}
        <div className="mt-8 flex flex-wrap gap-2 rounded-2xl border border-[#dfdbd1] bg-white p-1.5">
          {(["all", "sabbath", "vespers", "midweek", "special"] as Filter[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`flex-1 min-w-fit rounded-xl px-4 py-2.5 text-sm font-semibold capitalize transition ${
                filter === tab
                  ? "bg-[#26352f] text-white shadow-sm"
                  : "text-[#617068] hover:bg-[#f7f4ee]"
              }`}
            >
              {tab === "all" ? "All" : tab === "sabbath" ? "Sabbath" : tab === "vespers" ? "Vespers" : tab === "midweek" ? "Midweek" : "Special"}
            </button>
          ))}
        </div>

        {/* Service cards */}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item, i) => (
            <div
              key={i}
              className="relative flex h-52 flex-col items-center justify-center rounded-2xl border border-[#dfdbd1] bg-white text-center shadow-sm"
            >
              <span className="text-5xl">{item.emoji}</span>
              <p className="mt-4 px-4 text-sm font-semibold text-[#26352f]">{item.label}</p>
              <p className="text-xs text-[#617068]">{item.date} · {item.time}</p>
              <span className="absolute top-3 right-3 rounded-full bg-[#f7f4ee] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#b36b3c] capitalize">
                {item.type}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-[#617068]">
          Live streaming and recordings coming soon. Services will be available here.
        </p>
      </div>
    </main>
  );
}
