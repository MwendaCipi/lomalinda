import Link from "next/link";
import { fellowshipResources } from "@/config/fellowship-resources";

const materials = [
  {
    id: "hymnal",
    label: "SDA Hymnal",
    title: "Seventh-day Adventist Hymnal",
    description: "Search hymns by title, lyrics, category, or hymn number. Ideal for personal worship, choir preparation, and church song services.",
    href: fellowshipResources.hymnal,
    button: "Open SDA Hymnal",
    badge: "English Hymns",
    icon: "🎵",
  },
  {
    id: "nzk",
    label: "Nyimbo za Kristo (NZK)",
    title: "Nyimbo za Kristo",
    description: "Browse the complete Swahili hymnbook collection for Sabbath School, vespers, family devotions, and worship praise.",
    href: fellowshipResources.nzk,
    button: "Open Nyimbo za Kristo",
    badge: "Swahili Hymns",
    icon: "🎶",
  },
  {
    id: "bible",
    label: "Holy Bible",
    title: "Read & Study the Bible",
    description: "Search books, chapters, parallel translations, and study references for daily personal study and Sabbath School preparation.",
    href: fellowshipResources.bible,
    button: "Open Bible",
    badge: "Scripture",
    icon: "📖",
  },
  {
    id: "egw",
    label: "EGW Writings",
    title: "Ellen G. White Writings",
    description: "Explore the complete writings, devotionals, commentaries, and Spirit of Prophecy books of Ellen G. White through the official online library.",
    href: fellowshipResources.egw,
    button: "Open EGW Library",
    badge: "Spirit of Prophecy",
    icon: "📜",
  },
];

export default function MaterialsPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pb-16 pt-6 text-[#26352f] sm:py-8 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/share"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Fellowship</span>
        </Link>

        <div className="mt-4 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Materials</h1>
          <p className="mt-2 text-base text-[#617068]">
            Access worship hymnals, Holy Scriptures, and Ellen G. White writings in one place.
          </p>
        </div>

        {/* 4 Cards Grid */}
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-2">
          {materials.map((item) => (
            <article
              key={item.id}
              className="flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-md sm:p-7"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-3xl" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="rounded-full bg-[#b36b3c]/10 px-3 py-1 text-xs font-semibold text-[#b36b3c]">
                    {item.badge}
                  </span>
                </div>
                <h2 className="mt-4 text-xl font-semibold sm:text-2xl">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#617068]">{item.description}</p>
              </div>

              <div className="mt-6 border-t border-[#dfdbd1] pt-4">
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#26352f] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#b36b3c] sm:text-sm"
                >
                  <span>{item.button}</span>
                  <span>&rarr;</span>
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
