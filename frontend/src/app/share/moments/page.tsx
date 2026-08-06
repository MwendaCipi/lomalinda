"use client";

import Link from "next/link";

export default function MomentsPage() {
  // Placeholder tiles — real content will come from the backend media API
  const placeholders = [
    { label: "Fellowship Lunch", date: "3 Aug 2026", emoji: "🍽️" },
    { label: "Youth Outdoor Worship", date: "27 Jul 2026", emoji: "⛺" },
    { label: "Potluck Sabbath", date: "20 Jul 2026", emoji: "🥗" },
    { label: "Women's Ministry Picnic", date: "13 Jul 2026", emoji: "🌻" },
    { label: "Baptism Service", date: "6 Jul 2026", emoji: "💧" },
    { label: "Camp Meeting Fellowship", date: "29 Jun 2026", emoji: "⛺" },
  ];

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
              Moments
            </h1>
            <p className="mt-3 text-base leading-7 text-[#617068]">
              Photos and videos of fellowship moments, outings, and church life at Loma Linda.
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

        {/* No filter tabs needed — moments only */}

        {/* Media grid */}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {placeholders.map((item, i) => (
            <div
              key={i}
              className="group relative flex h-52 flex-col items-center justify-center rounded-2xl border border-[#dfdbd1] bg-white text-center shadow-sm"
            >
              <span className="text-5xl">{item.emoji}</span>
              <p className="mt-4 text-sm font-semibold text-[#26352f]">{item.label}</p>
              <p className="text-xs text-[#617068]">{item.date}</p>
              <span className="absolute top-3 right-3 rounded-full bg-[#f7f4ee] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#b36b3c]">
                Moment
              </span>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-[#617068]">
          Media uploads coming soon. Church members will be able to share photos and videos here.
        </p>
      </div>
    </main>
  );
}
