"use client";

import { useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function LegacyMissionReadingPage() {
  useEffect(() => {
    window.location.replace(`${API_URL}/api/members/mission-reading/adult/`);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f7f4ee] p-6 text-center text-sm font-semibold text-[#617068]">
      Opening Mission Reading...
    </main>
  );
}
