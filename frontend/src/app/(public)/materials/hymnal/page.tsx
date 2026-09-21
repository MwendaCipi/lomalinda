import { Suspense } from "react";
import Link from "next/link";
import { MaterialsSidebar, MaterialsMobileCards } from "@/components/sidebars/materials-sidebar";
import { fellowshipResources } from "@/config/fellowship-resources";
import { ArrowLeft } from "lucide-react";

const hymnals = [
  {
    id: "hymnal",
    label: "SDA Hymnal (English)",
    title: "Seventh-day Adventist Hymnal",
    description: "Search hymns by title, lyrics, category, or hymn number. Ideal for personal worship, choir preparation, and church song services.",
    href: fellowshipResources.hymnal,
    button: "Open English SDA Hymnal",
    badge: "English Hymns",
    icon: "🎵",
  },
  {
    id: "nzk",
    label: "Nyimbo za Kristo (NZK)",
    title: "Nyimbo za Kristo (Swahili)",
    description: "Browse the complete Swahili hymnbook collection for Sabbath School, vespers, family devotions, and worship praise.",
    href: fellowshipResources.nzk,
    button: "Open Nyimbo za Kristo",
    badge: "Swahili Hymns",
    icon: "🎶",
  },
];

export default function HymnalPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f7f4ee]" />}>
    <main className="min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <MaterialsSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
          {/* Mobile Back Link */}
          <div className="mb-4 lg:hidden">
            <Link
              href="/materials"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#b36b3c] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to All Materials</span>
            </Link>
          </div>
          {/* Mobile section cards (sidebar replacement) */}
          <MaterialsMobileCards />
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Church Hymnals</h1>
            <p className="mt-2 text-base text-[#617068]">
              Worship hymnals in English and Swahili for personal, family, and church praise.
            </p>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {hymnals.map((item) => (
              <a
                key={item.id}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col justify-between rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-md cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-3xl" aria-hidden="true">{item.icon}</span>
                    <span className="rounded-full bg-[#b36b3c]/10 px-3 py-1 text-xs font-semibold text-[#b36b3c]">
                      {item.badge}
                    </span>
                  </div>
                  <h2 className="mt-4 text-xl font-semibold transition-colors group-hover:text-[#b36b3c] sm:text-2xl">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#617068]">{item.description}</p>
                </div>

                <div className="mt-6 border-t border-[#dfdbd1] pt-4">
                  <span
                    className="inline-flex items-center gap-2 rounded-full bg-[#26352f] px-5 py-2.5 text-xs font-semibold text-white transition group-hover:bg-[#b36b3c] sm:text-sm"
                  >
                    <span>{item.button}</span>
                    <span>&rarr;</span>
                  </span>
                </div>
              </a>
            ))}
          </div>
          </div>
        </div>
      </div>
    </main>
    </Suspense>
  );
}
