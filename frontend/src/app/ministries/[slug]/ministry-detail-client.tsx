"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DepartmentCalendar } from "@/components/department-calendar";
import { MINISTRIES } from "@/config/ministries";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function MinistryDetailClient() {
  const { slug } = useParams<{ slug: string }>();
  const ministry = MINISTRIES.find((m) => m.slug === slug);
  const year = new Date().getFullYear();
  const [events, setEvents] = useState<{ date: string; name: string; department?: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (ministry?.department)
      fetch(`${API_URL}/api/members/sabbath-events/`)
        .then((response) => (response.ok ? response.json() : []))
        .then(setEvents)
        .catch(() => setEvents([]))
        .finally(() => setLoaded(true));
  }, [ministry?.department]);

  if (!ministry)
    return (
      <main className="min-h-screen bg-[#f7f4ee] px-6 py-12 text-center text-[#26352f]">
        <h1 className="text-2xl font-semibold">Ministry not found</h1>
        <Link href="/ministries" className="mt-4 inline-block font-semibold text-[#b36b3c]">
          &larr; View all ministries
        </Link>
      </main>
    );

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <div className="mx-auto max-w-5xl px-6 py-6 lg:px-8 lg:py-10">
        {/* Back Button */}
        <Link
          href="/ministries"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Ministries</span>
        </Link>

        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{ministry.title}</h1>
            <p className="mt-3 text-base leading-7 text-[#617068] sm:text-lg">{ministry.description}</p>
          </div>
          <Link
            href={`/give?purpose=${encodeURIComponent(ministry.givingPurpose)}`}
            className="inline-flex items-center justify-center rounded-full bg-[#b36b3c] px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#96552e]"
          >
            Support this ministry
          </Link>
        </div>

        {ministry.sections && (
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {ministry.sections.map((section) => (
              <section id={section.id} key={section.title} className="scroll-mt-28 rounded-2xl border border-[#dfdbd1] bg-white p-6 sm:p-7">
                <h2 className="text-lg font-semibold sm:text-xl">{section.title}</h2>
                <p className="mt-3 text-sm leading-6 text-[#617068]">{section.text}</p>
              </section>
            ))}
          </div>
        )}

        {ministry.department && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold sm:text-2xl">{ministry.title} calendar</h2>
            <DepartmentCalendar department={ministry.department} events={events} loaded={loaded} />
            <p className="mt-6 text-xs text-[#617068]">Showing events published for {year}.</p>
          </section>
        )}
      </div>
    </main>
  );
}
