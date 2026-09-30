"use client";

import { LiveReportsPanel } from "@/components/live-reports-panel";

/**
 * Live Balances — what the church's treasury accounts hold right now.
 *
 * This was one half of a combined Reports page, switched by a toggle. The two
 * halves were two destinations once and are two destinations again: the strip
 * at the top of the card carries Live Balances and Reports as sibling pages,
 * each opening directly instead of behind a toggle.
 */
export default function LiveBalancesPage() {
  return (
    <main className="min-h-screen bg-sand text-bark">
      <div className="p-5 pb-28 sm:p-8 lg:p-10">
        <div className="mx-auto max-w-5xl">
          {/* The panel names itself (Account Liquidity); the h1 is for
              screen readers, as on the Reports page beside it. */}
          <h1 className="sr-only">Live Balances</h1>
          <p className="sr-only">
            What the church holds right now, account by account, refreshed every
            thirty seconds.
          </p>
          <LiveReportsPanel />
        </div>
      </div>
    </main>
  );
}
