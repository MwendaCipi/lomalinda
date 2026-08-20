"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InKindGivingRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/give?tab=in_kind");
  }, [router]);

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">
      Redirecting to giving page...
    </main>
  );
}
