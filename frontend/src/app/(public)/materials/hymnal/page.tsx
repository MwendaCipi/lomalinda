"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The hymnbooks have one list, and it is the Hymnals shelf on `/materials`.
 *
 * This path used to carry a list of its own, which drifted from the shelf's:
 * the shelf knew two hymnbooks while this page knew five, so a member who
 * followed the Materials toggle never saw the others. Rather than keep two
 * lists in step, the shelf is the only one and this deep page hands old
 * bookmarks and links over to it. The readers themselves — Nyimbo za Kristo at
 * `/materials/hymnal/nyimbo-za-kristo` — stay where they are.
 */
export default function HymnalRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/materials/?section=hymnals");
  }, [router]);

  return (
    <main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">
      Redirecting to Hymnals...
    </main>
  );
}
