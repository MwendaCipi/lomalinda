"use client";

import { useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function AdultLessonPage() {
  useEffect(() => {
    // Push (not replace) the guide onto the history stack: with replace() the
    // redirect erases this page's entry, so the phone's Back gesture had
    // nothing to return to and closed the installed app instead.
    window.location.href = `${API_URL}/api/members/lesson-reading/adult/`;
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f7f4ee] p-6 text-center text-sm font-semibold text-[#617068]">
      Opening Adult Lesson Guide...
    </main>
  );
}
