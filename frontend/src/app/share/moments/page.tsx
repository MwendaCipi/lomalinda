"use client";

import Link from "next/link";
import { useState } from "react";

type Tab = "services" | "moments";

const servicesList = [
  { label: "Sabbath Worship Service", date: "3 Aug 2026", time: "8:00 AM", emoji: "🎵", badge: "Sabbath" },
  { label: "Friday Vespers", date: "1 Aug 2026", time: "5:30 PM", emoji: "🌅", badge: "Vespers" },
  { label: "Midweek Vespers", date: "30 Jul 2026", time: "8:00 PM", emoji: "🕯️", badge: "Midweek" },
  { label: "Sabbath Worship Service", date: "27 Jul 2026", time: "8:00 AM", emoji: "🎵", badge: "Sabbath" },
  { label: "Special Programme – Youth Sunday", date: "20 Jul 2026", time: "10:00 AM", emoji: "⭐", badge: "Special" },
  { label: "Friday Vespers", date: "18 Jul 2026", time: "5:30 PM", emoji: "🌅", badge: "Vespers" },
];

const momentsList = [
  { label: "Fellowship Lunch", date: "3 Aug 2026", emoji: "🍽️", badge: "Moment" },
  { label: "Youth Outdoor Worship", date: "27 Jul 2026", emoji: "⛺", badge: "Moment" },
  { label: "Potluck Sabbath", date: "20 Jul 2026", emoji: "🥗", badge: "Moment" },
  { label: "Women's Ministry Picnic", date: "13 Jul 2026", emoji: "🌻", badge: "Moment" },
  { label: "Baptism Service", date: "6 Jul 2026", emoji: "💧", badge: "Moment" },
  { label: "Camp Meeting Fellowship", date: "29 Jun 2026", emoji: "⛺", badge: "Moment" },
];

export default function LiveServicesAndMomentsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("services");

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
              Live Services &amp; Moments
            </h1>
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

        {/* 2 Tabs: Live Services vs Moments */}
        <div className="mt-8 flex rounded-2xl border border-[#dfdbd1] bg-white p-1.5 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("services")}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold transition ${
              activeTab === "services"
                ? "bg-[#26352f] text-white shadow-sm"
                : "text-[#617068] hover:bg-[#f7f4ee] hover:text-[#26352f]"
            }`}
          >
            📡 Live Services
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("moments")}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold transition ${
              activeTab === "moments"
                ? "bg-[#26352f] text-white shadow-sm"
                : "text-[#617068] hover:bg-[#f7f4ee] hover:text-[#26352f]"
            }`}
          >
            📸 Fellowship Moments
          </button>
        </div>

        {/* Media Grid */}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {activeTab === "services"
            ? servicesList.map((item, i) => (
                <div
                  key={i}
                  className="group relative flex h-52 flex-col items-center justify-center rounded-2xl border border-[#dfdbd1] bg-white text-center shadow-sm"
                >
                  <span className="text-5xl">{item.emoji}</span>
                  <p className="mt-4 px-4 text-sm font-semibold text-[#26352f]">{item.label}</p>
                  <p className="text-xs text-[#617068]">{item.date} · {item.time}</p>
                  <span className="absolute top-3 right-3 rounded-full bg-[#f7f4ee] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#b36b3c]">
                    {item.badge}
                  </span>
                </div>
              ))
            : momentsList.map((item, i) => (
                <div
                  key={i}
                  className="group relative flex h-52 flex-col items-center justify-center rounded-2xl border border-[#dfdbd1] bg-white text-center shadow-sm"
                >
                  <span className="text-5xl">{item.emoji}</span>
                  <p className="mt-4 text-sm font-semibold text-[#26352f]">{item.label}</p>
                  <p className="text-xs text-[#617068]">{item.date}</p>
                  <span className="absolute top-3 right-3 rounded-full bg-[#f7f4ee] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#b36b3c]">
                    {item.badge}
                  </span>
                </div>
              ))}
        </div>

        <p className="mt-8 text-center text-sm text-[#617068]">
          {activeTab === "services"
            ? "Live streaming and service recordings coming soon."
            : "Media uploads coming soon. Church members will be able to share photos and videos here."}
        </p>
      </div>
    </main>
  );
}
