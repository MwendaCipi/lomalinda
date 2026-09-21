"use client";

import { PublicSectionNav } from "@/components/public-section-nav";
import { fellowshipLinks } from "@/config/site-sections";

export default function LiveServicesPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <section className="px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Fellowship</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Live Services</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-[#617068]">
            Join our worship services online when you cannot be with us in person.
          </p>
        </div>
      </section>

      <section className="px-6 py-10 lg:px-8 lg:py-12">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-[2rem] border border-dashed border-[#c9c5bb] bg-white p-8 text-center sm:p-14">
            <span className="text-4xl" aria-hidden="true">
              📡
            </span>
            <h2 className="mt-4 text-xl font-semibold text-[#26352f]">No live services scheduled yet</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-[#617068]">
              Live streaming and service recordings are coming soon. Check back here to join worship online.
            </p>
          </div>
        </div>
      </section>

      {/* The old Fellowship sidebar, now part of the page. */}
      <PublicSectionNav
        eyebrow="Explore"
        title="Where the church family gathers"
        description="Notices, worship services, photos, testimonies, the calendar and your ideas — open any of them."
        links={fellowshipLinks}
        activeKey="services"
        className="border-t border-[#dfdbd1] bg-white/60"
      />
    </main>
  );
}
