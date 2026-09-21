"use client";

import { useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function LegacyLessonPage() {
  useEffect(() => {
    window.location.replace(`${API_URL}/api/members/lesson-reading/adult/`);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f7f4ee] p-6 text-center text-sm font-semibold text-[#617068]">
      Opening Lesson Guide...
    </main>
  );
}
