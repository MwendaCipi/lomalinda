"use client";

import { useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function ChildrenLessonPage() {
  useEffect(() => {
    window.location.replace(`${API_URL}/api/members/lesson-reading/children/primary/students/`);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-sand p-6 text-center text-sm font-semibold text-moss">
      Opening Children&apos;s Lesson Guide...
    </main>
  );
}
