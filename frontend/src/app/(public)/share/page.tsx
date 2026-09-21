import Link from "next/link";

import { PublicSectionNav } from "@/components/public-section-nav";
import { fellowshipLinks } from "@/config/site-sections";

export default function FellowshipPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <section className="px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Fellowship hub</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Fellowship &amp; Community</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-[#617068]">
            Connect with SDA Loma Linda through announcements, live worship services, shared testimonies, and the
            everyday life of the church family.
          </p>
        </div>
      </section>

      <section className="px-6 py-12 lg:px-8 lg:py-14">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-[#26352f] px-8 py-10 text-white shadow-sm sm:px-12 sm:py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#f1c89e]">Stay connected</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome to fellowship</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75">
            Stay up to date with church announcements, watch live worship broadcasts, and read what God is doing among
            us.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/announcements"
              className="rounded-full bg-[#b36b3c] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#96552e]"
            >
              View announcements
            </Link>
            <Link
              href="/share/moments"
              className="rounded-full border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/50"
            >
              Live services &amp; moments
            </Link>
          </div>
        </div>
      </section>

      {/* The old Fellowship sidebar, now part of the page: the same destinations. */}
      <PublicSectionNav
        eyebrow="Explore"
        title="Where the church family gathers"
        description="Notices, worship services, photos, testimonies, the calendar and your ideas — open any of them."
        links={fellowshipLinks}
        className="border-t border-[#dfdbd1] bg-white/60"
      />
    </main>
  );
}
