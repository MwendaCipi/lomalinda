import { Suspense } from "react";

import { GivingDesk } from "@/components/giving-desk";

/**
 * The member Giving desk — the Giving row of the rail and the phone's
 * Stewardship tab.
 *
 * The same form as the public Support Us page, pinned at every width with
 * the roll picker and the receipt addressed from the member's account. The
 * two are separate pages so neither changes shape under its readers: /give
 * belongs to the marketing site, and this page belongs to the app.
 */
export default function MemberGivingPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white px-6 py-16 text-center text-moss">
          Loading giving options...
        </main>
      }
    >
      <GivingDesk mode="member" />
    </Suspense>
  );
}
