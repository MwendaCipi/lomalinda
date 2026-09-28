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
    <main className="min-h-screen bg-sand text-bark">
      <section className="px-6 pt-14 lg:px-8">
        <div className="max-w-6xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Church Hymnals</h1>
          <p className="mt-3 hidden max-w-2xl text-base leading-8 text-moss sm:block">
            Worship hymnals in English and Swahili for personal, family, and church praise.
          </p>
        </div>
      </section>

      <section className="px-6 py-12 lg:px-8 lg:py-14">
        <div className="grid max-w-6xl gap-3 sm:gap-4 md:grid-cols-2">
          {hymnals.map((item) => {
            const Icon = item.icon;
            return (
            <a
              key={item.id}
              href={item.href}
              className="group flex flex-col justify-between rounded-2xl border border-sand-line bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-ember hover:shadow-md sm:p-4"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sand text-bark sm:h-9 sm:w-9"
                    aria-hidden="true"
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </span>
                  <span className="rounded-full bg-ember/10 px-2 py-0.5 text-[9px] font-semibold text-ember sm:px-2.5 sm:text-[10px]">
                    {item.badge}
                  </span>
                </div>
                <h2 className="mt-2 text-[13px] font-semibold tracking-tight transition-colors group-hover:text-ember sm:mt-2.5 sm:text-base">
                  {item.title}
                </h2>
                <p className="mt-1 text-[10px] leading-4 text-moss sm:text-[11px] sm:leading-5">{item.description}</p>
              </div>

              <div className="mt-2.5 border-t border-sand-line pt-2 sm:mt-3 sm:pt-2.5">
                <span className="inline-flex items-center gap-2 rounded-full bg-bark px-3 py-1 text-[10px] font-semibold text-white transition group-hover:bg-ember sm:px-3.5 sm:py-1.5 sm:text-[11px]">
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
        className="hidden border-t border-sand-line bg-white/60 lg:block"
      />
    </main>
  );
}
