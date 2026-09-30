"use client";

import { FinancialReportsPanel } from "@/components/financial-reports-panel";

/**
 * Reports — the statements the church publishes about its money.
 *
 * The live balances that shared this page behind a toggle are a page of their
 * own again (Live Balances, /support/financial): the two halves were two
 * destinations once and are two destinations again, carried as siblings by
 * the strip at the top of the card. The retired /support/periodical-reports
 * URL lands here, as it always has.
 */
export default function ReportsPage() {
  return (
    <main className="min-h-screen bg-sand text-bark">
      <div className="p-5 pb-28 sm:p-8 lg:p-10">
        <div className="mx-auto max-w-5xl">
          {/* The panel names itself (Published Statements); the h1 is for
              screen readers, as on the Live Balances page beside it. */}
          <h1 className="sr-only">Reports</h1>
          <p className="sr-only">
            The monthly, quarterly and annual statements the church publishes
            about what has come in and gone out.
          </p>
          <FinancialReportsPanel />
        </div>
      </div>
    </main>
  );
}
