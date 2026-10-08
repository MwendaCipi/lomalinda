"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Ideas is Sharing now: the testimony board and the ideas board are one page,
 * told apart by the sheet you fill in. Anything already linking here lands
 * there.
 */
export default function IdeasRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/spiritual/testimonies");
  }, [router]);

  return (
    <main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">
      Redirecting to Sharing…
    </main>
  );
}
