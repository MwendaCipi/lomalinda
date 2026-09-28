"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SabbathSchoolRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/materials/adult/lesson");
  }, [router]);

  return (
    <main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">
      Redirecting to Sabbath School Lesson...
    </main>
  );
}
