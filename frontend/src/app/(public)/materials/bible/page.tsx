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
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <section className="px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/materials"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#b36b3c] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to all materials</span>
          </Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Bible &amp; EGW Writings</h1>
          <p className="mt-3 max-w-2xl text-base leading-8 text-[#617068]">
            Read, search, and study Holy Scriptures and the published Spirit of Prophecy writings.
          </p>
        </div>
      </section>

      <section className="px-6 py-12 lg:px-8 lg:py-14">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2">
          {referenceShelf.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.id}
                href={item.href}
                className="group flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f7f4ee] text-[#26352f]"
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="rounded-full bg-[#b36b3c]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#b36b3c]">
                      {item.badge}
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold tracking-tight transition-colors group-hover:text-[#b36b3c]">
                    {item.title}
                  </h2>
                  <p className="mt-1.5 text-xs leading-6 text-[#617068]">{item.description}</p>
                </div>

                <div className="mt-4 border-t border-[#dfdbd1] pt-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#26352f] px-4 py-2 text-xs font-semibold text-white transition group-hover:bg-[#b36b3c]">
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
        className="hidden border-t border-[#dfdbd1] bg-white/60 lg:block"
      />
    </main>
  );
}
