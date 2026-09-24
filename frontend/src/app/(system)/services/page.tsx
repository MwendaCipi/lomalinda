"use client";

import { FellowshipSidebar } from "@/components/sidebars/fellowship-sidebar";
import { fellowshipLinks } from "@/config/site-sections";
import { PublicSectionNav } from "@/components/public-section-nav";

/**
 * Live services, inside the app shell.
 *
 * This page used to live on the public website at /share/services, where it
 * rendered with marketing chrome and no Fellowship sidebar — on a desktop the
 * sidebar simply vanished, as if the section had been left behind. It now
 * sits in the system group: the sidebar stays, and the section cards carry
 * the rest of the destinations.
 */
export default function LiveServicesPage() {
  return (
    <main className="min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <FellowshipSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] bg-[#f7f4ee] p-5 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Fellowship</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Live Services</h1>
              <p className="mt-2 text-sm leading-6 text-[#617068]">
                Join our worship services online when you cannot be with us in person.
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-[#c9c5bb] bg-white p-8 text-center sm:p-14">
              <span className="text-4xl" aria-hidden="true">
                📡
              </span>
              <h2 className="mt-4 text-xl font-semibold text-[#26352f]">No live services scheduled yet</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-[#617068]">
                Live streaming and service recordings are coming soon. Check back here to join worship online.
              </p>
            </div>

            {/* The rest of the section, as cards under the empty state. */}
            <PublicSectionNav
              eyebrow="Explore"
              title="Where the church family gathers"
              description="Notices, worship services, photos, testimonies, the calendar and your ideas — open any of them."
              links={fellowshipLinks}
              activeKey="services"
              className="!px-0 !py-0"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
