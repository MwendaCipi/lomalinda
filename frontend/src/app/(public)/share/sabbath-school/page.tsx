"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SabbathSchoolRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/materials/adult/lesson");
  }, [router]);

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">
      Redirecting to Sabbath School Lesson...
    </main>
  );
}
