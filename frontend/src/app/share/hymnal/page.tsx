"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HymnalRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/share/materials?tab=hymnal");
  }, [router]);

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">
      Redirecting to Materials...
    </main>
  );
}
