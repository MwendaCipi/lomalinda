"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * The Children Lessons family: one card per age-group division, each opening
 * that division's current student lesson guide through the backend redirect.
 */
const DIVISIONS = [
  {
    key: "beginner",
    label: "Beginners",
    ages: "Ages 0 – 2",
    description: "First steps in knowing Jesus, for the very youngest and their parents.",
  },
  {
    key: "kindergarten",
    label: "Kindergarten",
    ages: "Ages 3 – 4",
    description: "Bible stories and activities for preschool hearts and hands.",
  },
  {
    key: "primary",
    label: "Primary",
    ages: "Ages 5 – 9",
    description: "Weekly lessons that grow faith through the primary years.",
  },
  {
    key: "junior",
    label: "Junior PowerPoints",
    ages: "Ages 10 – 14",
    description: "Guides for pre-teens — discussion, discovery and daily walk.",
  },
  {
    key: "teens",
    label: "Teens (Cornerstone)",
    ages: "Ages 15 – 18",
    description: "Cornerstone Connections for teens facing real life with real faith.",
  },
];

export default function ChildrenLessonsPage() {
  const [opening, setOpening] = useState<string | null>(null);

  // The readers are remote documents; each card opens its division's current
  // student guide through the backend redirect, which caches the live URL.
  function openDivision(key: string) {
    setOpening(key);
    window.location.href = `${API_URL}/api/members/lesson-reading/children/${key}/students/`;
  }

  useEffect(() => {
    if (!opening) return;
    const t = setTimeout(() => setOpening(null), 10000);
    return () => clearTimeout(t);
  }, [opening]);

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <section className="px-6 pt-10 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Study Materials</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Children&apos;s Lesson Guides</h1>
          <p className="mt-2 text-sm leading-6 text-[#617068]">
            One guide per age group. Open a division to read its current lesson — student edition.
          </p>
        </div>
      </section>

      <section className="px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-3 sm:grid-cols-2">
            {DIVISIONS.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => openDivision(d.key)}
                className="group flex items-center gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c]/50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] text-2xl" aria-hidden="true">
                  🎨
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#26352f]">{d.label}</span>
                    <span className="rounded-full bg-[#eef2ed] px-2 py-0.5 text-[10px] font-bold text-[#3d5148]">{d.ages}</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#617068]">{d.description}</span>
                </span>
                {opening === d.key ? (
                  <span className="shrink-0 text-xs font-semibold text-[#b36b3c]">Opening…</span>
                ) : (
                  <ExternalLink className="h-4 w-4 shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" />
                )}
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
