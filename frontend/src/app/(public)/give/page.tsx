import { Suspense } from "react";

import { GivingDesk } from "@/components/giving-desk";

/**
 * The public Support Us page — tithes and offerings, online and by mobile
 * money, for anyone who has not signed in. A signed-in reader keeps the
 * marketing site's own chrome here; the member Giving desk is its own page
 * at /member/giving, which is what lets the two sides stop sharing one URL.
 */
export default function GivePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white px-6 py-16 text-center text-moss">
          Loading giving options...
        </main>
      }
    >
      <GivingDesk mode="visitor" />
    </Suspense>
  );
}
