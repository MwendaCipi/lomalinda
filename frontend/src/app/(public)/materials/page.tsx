"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { PublicSectionNav } from "@/components/public-section-nav";
import { materialSections, materialSectionLinks, type MaterialSection } from "@/config/site-sections";
import { fellowshipResources } from "@/config/fellowship-resources";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface MaterialCard {
  title: string;
  subtitle: string;
  description: string;
  href: string;
  icon: string;
  badge: string;
  actionText: string;
  isExternal?: boolean;
}

const itemsBySection: Record<MaterialSection, { heading: string; items: MaterialCard[] }> = {
  "hymnals": {
    heading: "Hymnals & Songs",
    items: [
      {
        title: "Hymnals (SDA & NZK)",
        subtitle: "English & Swahili Songs",
        description: "Complete hymn lyrics and song search from both the SDA Church Hymnal and Nyimbo za Kristo.",
        href: "/materials/hymnal",
        icon: "🎵",
        badge: "Worship & Songs",
        actionText: "Open Hymnal Collection",
      },
    ],
  },
  "bible-egw": {
    heading: "Bible & Spirit of Prophecy",
    items: [
      {
        title: "Holy Bible",
        subtitle: "Scripture & Study",
        description: "Read, search, and study the Word of God across books, chapters, and parallel translations.",
        href: "/materials/bible",
        icon: "📜",
        badge: "Holy Word",
        actionText: "Read Holy Scriptures",
      },
      {
        title: "Spirit of Prophecy",
        subtitle: "Ellen G. White Estate",
        description: "Browse the complete published writings, daily devotionals, and archives of the Spirit of Prophecy.",
        href: fellowshipResources.egw,
        icon: "✨",
        badge: "EGW Writings",
        actionText: "Visit EGW Estate",
        isExternal: true,
      },
    ],
  },
  "adult-weekly": {
    heading: "Adult Weekly",
    items: [
      {
        title: "Adult Lesson Guide",
        subtitle: "Sabbath School Net",
        description: "Weekly study guide for adults and senior youth with daily Scripture readings, discussion points, and commentary.",
        href: `${API_URL}/api/members/lesson-reading/adult/`,
        icon: "📖",
        badge: "Adults & Youth",
        actionText: "Open Lesson Guide",
        isExternal: true,
      },
      {
        title: "Adult Mission Reading",
        subtitle: "Adventist Mission Reports",
        description: "Inspiring weekly testimonies and frontline mission stories highlighting how the Gospel is spreading worldwide.",
        href: `${API_URL}/api/members/mission-reading/adult/`,
        icon: "🌍",
        badge: "World Mission",
        actionText: "Read Mission Stories",
        isExternal: true,
      },
    ],
  },
  "children-weekly": {
    heading: "Children Weekly",
    items: [
      {
        title: "Children's Lesson Guide",
        subtitle: "Alive in Jesus & PowerPoints",
        description: "Lessons tailored across 5 age groups: Beginners (0-2), Kindergarten (3-4), Primary (5-9), Junior (10-14), and Teens (15-18).",
        href: `${API_URL}/api/members/lesson-reading/children/primary/students/`,
        icon: "🎨",
        badge: "Ages 0 - 18",
        actionText: "Explore Children Lessons",
        isExternal: true,
      },
      {
        title: "Children's Mission Reading",
        subtitle: "Kids Mission Adventures",
        description: "Vibrant mission stories told especially for children to inspire global awareness, prayer, and faith in Jesus.",
        href: `${API_URL}/api/members/mission-reading/children/`,
        icon: "🎈",
        badge: "Kids & Juniors",
        actionText: "Read Kids Stories",
        isExternal: true,
      },
    ],
  },
};

function MaterialsContent() {
  const searchParams = useSearchParams();
  const [signedIn, setSignedIn] = useState(false);
  const raw = searchParams.get("section") as MaterialSection | null;

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem("access_token")));
  }, []);
  const active: MaterialSection = raw && itemsBySection[raw] ? raw : "bible-egw";
  const sectionMeta = materialSections.find((s) => s.value === active)!;
  const { heading, items } = itemsBySection[active];

  return (
    <main className={signedIn ? "min-h-full bg-white text-[#26352f]" : "min-h-screen bg-[#f7f4ee] text-[#26352f]"}>
      <section className={signedIn ? "px-5 py-5 sm:px-8 lg:px-10" : "px-6 pt-14 lg:px-8"}>
        <div className={signedIn ? "max-w-5xl" : "mx-auto max-w-6xl"}>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">
            Study &amp; worship resources
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Church Study Materials</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-[#617068]">
            Sabbath School lessons, mission readings, Scripture and the Spirit of Prophecy — gathered in one place for
            personal devotion, family worship and class preparation.
          </p>
        </div>
      </section>

      {/* The old Study Materials sidebar, now part of the page body. */}
      <PublicSectionNav
        eyebrow="Sections"
        title="Choose a study area"
        description="Four collections, each with its own guides and readings."
        links={materialSectionLinks}
        activeKey={active}
      />

      <section className={signedIn ? "border-t border-[#dfdbd1] bg-white px-5 py-8 sm:px-8 lg:px-10" : "border-t border-[#dfdbd1] bg-white/60 px-6 py-12 lg:px-8 lg:py-14"}>
        <div className={signedIn ? "max-w-5xl" : "mx-auto max-w-6xl"}>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[#617068]">{sectionMeta.description}</p>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {items.map((item) => {
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl" aria-hidden="true">{item.icon}</span>
                      <div>
                        <h3 className="text-base font-semibold tracking-tight text-[#26352f]">{item.title}</h3>
                        <p className="text-xs font-semibold text-[#b36b3c]">{item.subtitle}</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#eef2ed] px-3 py-1 text-[10px] font-bold text-[#3d5148]">
                      {item.badge}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#617068]">{item.description}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#b36b3c] group-hover:underline">
                    {item.actionText}
                    {item.isExternal ? <ExternalLink className="h-3.5 w-3.5" /> : <span aria-hidden="true">&rarr;</span>}
                  </span>
                </>
              );

              const cls =
                "group flex flex-col rounded-[1.5rem] border border-[#dfdbd1] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-md";

              return item.isExternal ? (
                <a key={item.title} href={item.href} target="_blank" rel="noreferrer" className={cls}>
                  {inner}
                </a>
              ) : (
                <Link key={item.title} href={item.href} className={cls}>
                  {inner}
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

export default function MaterialsOverviewPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f7f4ee]" />}>
      <MaterialsContent />
    </Suspense>
  );
}
