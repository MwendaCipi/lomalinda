"use client";

import { FellowshipSidebar } from "@/components/sidebars/fellowship-sidebar";

export default function LiveServicesPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <div className="flex min-h-[calc(100vh-89px)]">
        <FellowshipSidebar />
        <div className="flex-1 min-w-0 px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <div className="max-w-5xl mx-auto space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">
                Fellowship
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Live Services
              </h1>
            </div>

            {/* Empty state */}
            <section className="mt-6">
              <div className="rounded-3xl border border-dashed border-[#c9c5bb] bg-white p-8 sm:p-12 text-center">
                <span className="text-4xl" aria-hidden="true">📡</span>
                <h3 className="mt-3 text-lg font-semibold text-[#26352f]">
                  No live services scheduled yet
                </h3>
                <p className="mt-1 text-sm text-[#617068]">
                  Live streaming and service recordings are coming soon. Check back here to join worship online.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
