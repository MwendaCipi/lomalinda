"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ShareMaterialsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/materials");
  }, [router]);

  return (
    <main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">
      Redirecting to Materials...
    </main>
  );
}
