"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, FileText } from "lucide-react";

import { LiveReportsPanel } from "@/components/live-reports-panel";
import { FinancialReportsPanel } from "@/components/financial-reports-panel";

/**
 * Reports — the church's accounts, and the statements it publishes about them.
 *
 * These were two destinations in the rail, which made the giving branch as long
 * as the rest of the app put together. They are two halves of one question —
 * what does the church hold, and what has it reported — so they share a page
 * and a toggle at the top switches between them.
 */

type View = "live" | "periodic";

const VIEWS: { value: View; label: string; icon: typeof Activity }[] = [
  { value: "live", label: "Live Balances", icon: Activity },
  { value: "periodic", label: "Published Statements", icon: FileText },
];

function ReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The retired /support/periodical-reports URL redirects here with ?view=
  // periodic, so a bookmarked link still opens the statements it named.
  const view: View = searchParams.get("view") === "periodic" ? "periodic" : "live";

  const selectView = (next: View) => {
    // `replace`, not `push`: flipping a toggle is not a place to come back to.
    router.replace(next === "live" ? "/support/reports" : `/support/reports?view=${next}`, {
      scroll: false,
    });
  };

  return (
    <main className="min-h-screen md:h-full md:min-h-0 bg-sand text-bark md:overflow-hidden">
      <div className="flex h-full md:overflow-hidden">
        <div className="flex-1 min-w-0 w-full h-full bg-sand p-5 pb-28 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                {/* The strip names the page; the h1 is for screen readers. */}
                <h1 className="sr-only">Reports</h1>
                <p className="sr-only">
                  What the church holds right now, and the statements it publishes about what has
                  come in and gone out.
                </p>
              </div>

              {/* One segmented control, the same shape the giving page uses for
                  its own two views. */}
              <div
                role="group"
                aria-label="Report view"
                className="flex h-10 shrink-0 items-center rounded-xl border border-sand-line bg-white p-0.5"
              >
                {VIEWS.map((option) => {
                  const Icon = option.icon;
                  const active = view === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => selectView(option.value)}
                      aria-pressed={active}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${
                        active ? "bg-bark text-white shadow-sm" : "text-moss hover:text-bark"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {view === "live" ? <LiveReportsPanel /> : <FinancialReportsPanel />}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-sand px-6 py-16 text-center text-sm text-moss">
          Loading reports…
        </main>
      }
    >
      <ReportsContent />
    </Suspense>
  );
}
