"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { MaterialsSidebar, MaterialsMobileCards, materialSections, type MaterialSection } from "@/components/sidebars/materials-sidebar";
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
  const raw = searchParams.get("section") as MaterialSection | null;
  const active: MaterialSection = raw && itemsBySection[raw] ? raw : "bible-egw";
  const sectionMeta = materialSections.find((s) => s.value === active)!;
  const { heading, items } = itemsBySection[active];

  return (
    <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <MaterialsSidebar />

        <div className="flex-1 min-w-0 w-full h-full md:h-[calc(100vh-4rem)] bg-white p-5 sm:p-8 lg:p-10 border-b border-[#dfdbd1] md:overflow-y-auto custom-hover-scrollbar">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="hidden border-b border-[#dfdbd1] pb-6 text-center sm:block">
              <span className="rounded-full bg-[#b36b3c]/10 px-3.5 py-1 text-xs font-bold text-[#b36b3c]">
                Study &amp; Worship Resources
              </span>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#26352f] sm:text-3xl">
                Church Study Materials
              </h1>
            </div>

            {/* Mobile section cards (sidebar replacement) */}
            <MaterialsMobileCards />

            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[#26352f] sm:text-xl">{heading}</h2>
                <p className="mt-1 text-xs text-[#617068] sm:text-sm">{sectionMeta.description}</p>
              </div>

              <div className="grid gap-4">
                {items.map((item) => {
                  const inner = (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl" aria-hidden="true">{item.icon}</span>
                          <div>
                            <h3 className="text-sm font-bold text-[#26352f]">{item.title}</h3>
                            <p className="text-[11px] font-medium text-[#b36b3c]">{item.subtitle}</p>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-[#eef2ed] px-2.5 py-0.5 text-[10px] font-bold text-[#3d5148]">
                          {item.badge}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-[#617068]">{item.description}</p>
                      <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#b36b3c]">
                        {item.actionText}
                        {item.isExternal ? (
                          <ExternalLink className="h-3 w-3" />
                        ) : (
                          <span aria-hidden="true">&rarr;</span>
                        )}
                      </span>
                    </>
                  );

                  const cls =
                    "block rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md sm:p-5";

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
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function MaterialsOverviewPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white" />}>
      <MaterialsContent />
    </Suspense>
  );
}
