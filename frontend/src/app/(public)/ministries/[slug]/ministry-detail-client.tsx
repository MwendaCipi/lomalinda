"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getMinistryBySlug, CalendarEvent } from "@/config/ministries";
import DepartmentCalendar from "@/components/department-calendar";
import { PublicSectionNav } from "@/components/public-section-nav";
import { ministrySectionLinks } from "@/config/site-sections";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function MinistryDetailClient() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const ministry = getMinistryBySlug(slug);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (!ministry?.department) return;
    fetch(`${API_URL}/api/members/sabbath-events/`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setEvents(data))
      .catch(() => setEvents([]))
      .finally(() => setLoaded(true));
  }, [ministry?.department]);

  if (!ministry)
    return (
      <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#26352f]">
        <h1 className="text-3xl font-semibold">Ministry not found</h1>
        <Link href="/ministries" className="mt-6 inline-block font-semibold text-[#b36b3c]">
          Back to ministries &rarr;
        </Link>
      </main>
    );

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-12">
          <div className="space-y-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Ministry</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{ministry.title}</h1>
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
              <div className="grid gap-5 md:grid-cols-3">
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
      </div>

      {/* The old ministry sidebar, now part of the page. */}
      <PublicSectionNav
        eyebrow="Church ministries"
        title="Explore our other ministries"
        description="Each ministry has its own programme, leaders and calendar — open one to see what they do."
        links={ministrySectionLinks}
        activeKey={slug}
        className="border-t border-[#dfdbd1] bg-white/60"
      />
    </main>
  );
}
