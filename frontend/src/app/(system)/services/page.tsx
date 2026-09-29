"use client";

import { fellowshipLinks } from "@/config/site-sections";
import { PublicSectionNav } from "@/components/public-section-nav";
import { SatelliteDish } from "lucide-react";

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
    <main className="min-h-screen md:h-screen bg-sand text-bark md:overflow-hidden">
      <div className="flex h-full md:h-full md:overflow-hidden">
        <div className="flex-1 min-w-0 h-full md:h-full bg-sand p-5 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* The strip names the page; the h1 is for screen readers. */}
            <h1 className="sr-only">Live Services</h1>

            <div className="rounded-2xl border border-dashed border-sand-mute bg-white p-8 text-center sm:p-14">
              <SatelliteDish size={36} className="text-moss-faint" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-semibold text-bark">No live services scheduled yet</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-moss">
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
