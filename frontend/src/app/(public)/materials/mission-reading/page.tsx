"use client";

import { useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function LegacyMissionReadingPage() {
  useEffect(() => {
    window.location.replace(`${API_URL}/api/members/mission-reading/adult/`);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-sand p-6 text-center text-sm font-semibold text-moss">
      Opening Mission Reading...
    </main>
  );
}
