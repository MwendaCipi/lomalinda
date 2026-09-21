"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type ChurchSettings = {
  clarion_call_heading?: string;
  clarion_call_subtext?: string;
};

const defaultHeadingLines = [
  "A place to belong.",
  "A faith to share.",
  "A hope that transforms lives.",
];

const defaultSubtext =
  "Join SDA Loma Linda, Meru as we study God's Word, support one another, and reach out to our community with faith and compassion.";

/**
 * The church's clarion call — the standing welcome at the top of the site.
 *
 * Deliberately constant: announcements, campaigns and weekly events no longer
 * replace it, they appear in their own cards beside it.
 */
export function ClarionHero() {
  const [settings, setSettings] = useState<ChurchSettings | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ChurchSettings) => {
        if (data) setSettings(data);
      })
      .catch(() => undefined);
  }, []);

  const headingText = settings?.clarion_call_heading?.trim() || "";
  const headingLines = headingText ? headingText.split("\n") : defaultHeadingLines;
  const subtext = settings?.clarion_call_subtext || defaultSubtext;

  return (
    <div>
      <h1 className="mt-4 text-3xl font-semibold leading-[1.15] tracking-tight sm:mt-6 sm:text-6xl">
        {headingLines.map((line, idx) => (
          <span key={idx} className="hero-line block">
            {line}
          </span>
        ))}
      </h1>
      <p className="hero-line mt-5 text-base leading-7 text-[#617068] sm:mt-7 sm:text-lg sm:leading-8">
        {subtext}
      </p>
      <div className="hero-line mt-6 grid grid-cols-1 gap-3 sm:mt-9 sm:grid-cols-2 sm:gap-4 sm:max-w-xl">
        <Link
          href="#contact"
          className="flex items-center justify-center rounded-full border border-[#c9c5bb] bg-white px-4 py-3 text-center text-sm font-medium transition hover:border-[#26352f] hover:bg-[#eae6de] sm:py-3.5 sm:text-base"
        >
          Location &amp; Contacts
        </Link>
        <Link
          href="/calendar"
          className="flex items-center justify-center rounded-full border border-[#c9c5bb] bg-white px-4 py-3 text-center text-sm font-medium transition hover:border-[#26352f] hover:bg-[#eae6de] sm:py-3.5 sm:text-base"
        >
          See Our Calendar
        </Link>
      </div>
    </div>
  );
}
