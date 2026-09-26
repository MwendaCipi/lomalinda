import { Music, Music2, type LucideIcon } from "lucide-react";

import { PublicSectionNav } from "@/components/public-section-nav";
import { materialSectionLinks } from "@/config/site-sections";
import { fellowshipResources } from "@/config/fellowship-resources";

const hymnals: {
  id: string;
  title: string;
  description: string;
  href: string;
  button: string;
  badge: string;
  icon: LucideIcon;
}[] = [
  {
    id: "hymnal",
    title: "Seventh-day Adventist Hymnal",
    description: "Search hymns by title, lyrics, category, or hymn number. Ideal for personal worship, choir preparation, and church song services.",
    href: fellowshipResources.hymnal,
    button: "Open English SDA Hymnal",
    badge: "English Hymns",
    icon: Music,
  },
  {
    id: "nzk",
    title: "Nyimbo za Kristo (Swahili)",
    description: "Browse the complete Swahili hymnbook collection for Sabbath School, vespers, family devotions, and worship praise.",
    href: fellowshipResources.nzk,
    button: "Open Nyimbo za Kristo",
    badge: "Swahili Hymns",
    icon: Music2,
  },
];

export default function HymnalPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <section className="px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Church Hymnals</h1>
          <p className="mt-3 max-w-2xl text-base leading-8 text-[#617068]">
            Worship hymnals in English and Swahili for personal, family, and church praise.
          </p>
        </div>
      </section>

      <section className="px-6 py-12 lg:px-8 lg:py-14">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2">
          {hymnals.map((item) => {
            const Icon = item.icon;
            return (
            <a
              key={item.id}
              href={item.href}
              className="group flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f7f4ee] text-[#26352f]"
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="rounded-full bg-[#b36b3c]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#b36b3c]">
                    {item.badge}
                  </span>
                </div>
                <h2 className="mt-2.5 text-sm font-semibold tracking-tight transition-colors group-hover:text-[#b36b3c] sm:text-base">
                  {item.title}
                </h2>
                <p className="mt-1 text-[11px] leading-5 text-[#617068]">{item.description}</p>
              </div>

              <div className="mt-3 border-t border-[#dfdbd1] pt-2.5">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#26352f] px-3.5 py-1.5 text-[11px] font-semibold text-white transition group-hover:bg-[#b36b3c]">
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
        description="Lessons, mission readings, Scripture and the Spirit of Prophecy."
        links={materialSectionLinks}
        activeKey="hymnals"
        className="hidden border-t border-[#dfdbd1] bg-white/60 lg:block"
      />
    </main>
  );
}
