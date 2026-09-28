import Link from "next/link";
import { ArrowLeft, BookOpen, Feather, type LucideIcon } from "lucide-react";

import { PublicSectionNav } from "@/components/public-section-nav";
import { materialSectionLinks } from "@/config/site-sections";
import { fellowshipResources } from "@/config/fellowship-resources";

/**
 * The reference shelf: Scripture and the Spirit of Prophecy, two cards because
 * they are two readers. Both open in the same tab — inside the installed PWA a
 * new tab has no history, so the reader's Back gesture would close the app.
 */
const referenceShelf: {
  id: string;
  icon: LucideIcon;
  badge: string;
  title: string;
  description: string;
  href: string;
  button: string;
}[] = [
  {
    id: "bible",
    icon: BookOpen,
    badge: "Scripture & Word",
    title: "Read & Search the Holy Bible",
    description:
      "Search books, chapters, parallel translations, and study references for daily personal devotions, family altar, and Sabbath School lesson preparation.",
    href: fellowshipResources.bible,
    button: "Launch Online Bible Search",
  },
  {
    id: "egw",
    icon: Feather,
    badge: "Spirit of Prophecy",
    title: "Explore the E.G. White Writings",
    description:
      "The complete published writings of Ellen G. White — books, articles, letters and manuscripts, searchable by topic, scripture reference or phrase.",
    href: fellowshipResources.egw,
    button: "Open EGW Writings",
  },
];

export default function BiblePage() {
  return (
    <main className="min-h-screen bg-sand text-bark">
      <section className="px-6 pt-14 lg:px-8">
        <div className="max-w-6xl">
          <Link
            href="/materials"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ember hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to all materials</span>
          </Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Bible &amp; EGW Writings</h1>
          <p className="mt-3 hidden max-w-2xl text-base leading-8 text-moss sm:block">
            Read, search, and study Holy Scriptures and the published Spirit of Prophecy writings.
          </p>
        </div>
      </section>

      <section className="px-6 py-12 lg:px-8 lg:py-14">
        <div className="grid max-w-6xl gap-3 sm:gap-4 md:grid-cols-2">
          {referenceShelf.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.id}
                href={item.href}
                className="group flex flex-col justify-between rounded-2xl border border-sand-line bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-ember hover:shadow-md sm:p-5"
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sand text-bark sm:h-10 sm:w-10"
                      aria-hidden="true"
                    >
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </span>
                    <span className="rounded-full bg-ember/10 px-2.5 py-0.5 text-[10px] font-semibold text-ember sm:text-[11px]">
                      {item.badge}
                    </span>
                  </div>
                  <h2 className="mt-2 text-base font-semibold tracking-tight transition-colors group-hover:text-ember sm:mt-3 sm:text-lg">
                    {item.title}
                  </h2>
                  <p className="mt-1 text-[11px] leading-5 text-moss sm:mt-1.5 sm:text-xs sm:leading-6">{item.description}</p>
                </div>

                <div className="mt-3 border-t border-sand-line pt-2.5 sm:mt-4 sm:pt-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-bark px-3.5 py-1.5 text-[11px] font-semibold text-white transition group-hover:bg-ember sm:px-4 sm:py-2 sm:text-xs">
                    <span>{item.button}</span>
                    <span>&rarr;</span>
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {/* The old Study Materials sidebar, now part of the page body. On phones
          the destination cards are the map, so this long tail is desktop-only. */}
      <PublicSectionNav
        eyebrow="Study materials"
        title="More study areas"
        description="Lessons, mission readings, hymns and the Spirit of Prophecy."
        links={materialSectionLinks}
        activeKey="bible-egw"
        className="hidden border-t border-sand-line bg-white/60 lg:block"
      />
    </main>
  );
}
