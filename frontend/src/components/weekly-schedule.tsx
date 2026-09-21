"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type ChurchSettings = {
  midweek_vespers_time?: string;
  friday_vespers_time?: string;
  sabbath_time?: string;
};

// Each gathering is stored in Church Settings as one string, "Wednesday · 8:00 PM – 9:00 PM".
function splitWhen(value: string | undefined, fallbackDay: string, fallbackTime: string) {
  const [rawDay, rawTime] = (value || "").split("·");
  return {
    day: (rawDay || "").trim() || fallbackDay,
    time: (rawTime || "").trim() || fallbackTime,
  };
}

/**
 * The week at a glance. Times come from Church Settings, so a change there
 * shows up on the website without a redeploy.
 */
export function WeeklySchedule() {
  const [settings, setSettings] = useState<ChurchSettings | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ChurchSettings) => setSettings(data))
      .catch(() => setSettings(null));
  }, []);

  const gatherings = [
    {
      ...splitWhen(settings?.midweek_vespers_time, "Wednesday", "8:00 PM – 9:00 PM"),
      name: "Midweek Vespers",
      place: "Online",
    },
    {
      ...splitWhen(settings?.friday_vespers_time, "Friday", "5:30 PM – 6:30 PM"),
      name: "Friday Vespers",
      place: "Church sanctuary",
    },
    {
      ...splitWhen(settings?.sabbath_time, "Saturday", "8:00 AM – 4:00 PM"),
      name: "Sabbath worship",
      place: "Church grounds",
    },
  ];

  return (
    <section id="calendar" className="border-y border-[#dfdbd1] bg-white/60 px-6 py-16 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Weekly calendar</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Connect &amp; worship with us</h2>
          </div>
          <Link href="/calendar" className="text-sm font-semibold text-[#b36b3c] hover:underline">
            See all Sabbaths &rarr;
          </Link>
        </div>

        <div className="mt-10 grid gap-8 border-t border-[#dfdbd1] md:grid-cols-3 md:gap-0 md:divide-x md:divide-[#dfdbd1]">
          {gatherings.map((gathering) => (
            <article key={gathering.name} className="pt-6 md:px-7 md:first:pl-0 md:last:pr-0">
              <p className="text-sm font-semibold text-[#b36b3c]">{gathering.day}</p>
              <h3 className="mt-3 text-xl font-semibold">{gathering.name}</h3>
              <p className="mt-2 text-sm font-medium text-[#26352f]">{gathering.time}</p>
              <p className="mt-1 text-sm text-[#617068]">{gathering.place}</p>
            </article>
          ))}
        </div>

        <p className="mt-8 text-sm text-[#617068]">
          Visiting for the first time? Everything you need — programmes, times and what to expect — is on the{" "}
          <Link href="/calendar" className="font-semibold text-[#b36b3c] hover:underline">
            church calendar
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
