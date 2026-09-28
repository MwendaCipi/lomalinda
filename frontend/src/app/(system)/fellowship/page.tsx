"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTableDensity, DensityToggle } from "@/lib/table-density";
import { destinationOf, fellowshipHubKeys } from "@/config/navigation";

/**
 * The Fellowship hub the tab bar opens — on phones as a bottom tab, on
 * desktop through the same bar entry. The cards are the nav registry's
 * Fellowship destinations (config/navigation.ts), so they can never drift
 * from what the user menu or footer call the same place. Requests and Care
 * merged into Fellowship here: prayer and visitation are one desk, child
 * dedication and membership are part of the same walk-with-you set, and
 * partnership requests were retired.
 */
const cards = fellowshipHubKeys.map(destinationOf);

export default function FellowshipHubPage() {
  // The desk-wide compact preference, shared with the roster and every other
  // table: here it tightens the hub's cards rather than a table's rows.
  const { dense, toggleDensity } = useTableDensity();

  return (
    <main className="min-h-screen md:h-screen bg-sand text-bark md:overflow-hidden">
      <div className="mx-auto h-full w-full max-w-3xl px-4 py-6 sm:px-8 md:overflow-y-auto custom-hover-scrollbar">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember">Fellowship &amp; Community</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Fellowship</h1>
            <p className="mt-2 text-sm leading-6 text-moss">
              Where the church family gathers — open any of them.
            </p>
          </div>
          <DensityToggle dense={dense} onToggle={toggleDensity} />
        </div>

        <div className={`grid ${dense ? "mt-3 gap-2" : "mt-6 gap-3"} sm:grid-cols-2`}>
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className={`group flex items-center rounded-2xl border border-sand-line bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50 ${
                  dense ? "gap-3 p-3" : "gap-4 p-4"
                }`}
              >
                <span className={`flex shrink-0 items-center justify-center rounded-xl bg-sand text-moss transition group-hover:bg-ember/15 group-hover:text-ember ${dense ? "h-9 w-9" : "h-11 w-11"}`}>
                  <Icon className={dense ? "h-4 w-4" : "h-5 w-5"} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-bark">{card.label}</span>
                  {!dense && <span className="mt-0.5 block text-xs leading-5 text-moss">{card.description}</span>}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" />
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
