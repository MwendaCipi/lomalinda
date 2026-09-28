"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ShareHymnalRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/materials/hymnal");
  }, [router]);

  return (
    <main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">
      Redirecting to Hymnals...
    </main>
  );
}
