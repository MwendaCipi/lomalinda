"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const adultResources = [
  {
    title: "Lesson",
    text: "Open the current Weekly Lesson on Sabbath School Net.",
    href: `${API_URL}/api/members/lesson-reading/adult/`,
    icon: "📖",
    buttonText: "Open Lesson",
  },
];

const childrenDivisions = [
  {
    division: "Beginners",
    age: "Ages 0 - 2",
    studentsLink: "https://app.beginner.aliveinjesus.info/resources/en/aij/2025-04-bg/06",
    teachersLink: "https://app.beginner.aliveinjesus.info/resources/en/aij/2025-04-bg-tg/06",
    icon: "🍼",
  },
  {
    division: "Kindergarten",
    age: "Ages 3 - 4",
    studentsLink: "https://app.kindergarten.aliveinjesus.info/resources/en/aij/2026-03-kd/06",
    teachersLink: "https://app.kindergarten.aliveinjesus.info/resources/en/aij/2026-03-kd-tg/06",
    icon: "🎨",
  },
  {
    division: "Primary",
    age: "Ages 5 - 9",
    studentsLink: "https://app.primary.aliveinjesus.info/resources/en/aij/2026-03-pr/06",
    teachersLink: "https://app.primary.aliveinjesus.info/resources/en/aij/2026-03-pr-tg/06",
    icon: "✏️",
  },
  {
    division: "Junior / Earliteen",
    age: "Ages 10 - 14",
    studentsLink: "https://www.juniorpowerpoints.org/assets/juniors/Lessons/2026/Q3/English/Student/PP-26-Q3-L06.pdf",
    teachersLink: "https://www.juniorpowerpoints.org/assets/juniors/Lessons/2026/Q3/English/Teacher/PP-26-Q3-L06-T.pdf",
    icon: "📚",
  },
  {
    division: "Teens",
    age: "Ages 15 - 18",
    studentsLink: "https://www.cornerstoneconnections.net/assets/teens/Lessons/2026/Q3/English/Student/CC-26-Q3-L06.pdf",
    teachersLink: "https://www.cornerstoneconnections.net/assets/teens/Lessons/2026/Q3/English/Teacher/CC-26-Q3-L06-T.pdf",
    icon: "🎓",
  },
];

export default function SabbathSchoolPage() {
  const [currentInfo, setCurrentInfo] = useState({ quarter: 3, week: 6 });

  useEffect(() => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const quarterStart = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
    const week = Math.min(Math.max(Math.ceil((now.getTime() - quarterStart.getTime()) / (1000 * 3600 * 24 * 7)), 1), 13);
    setCurrentInfo({ quarter, week });
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pb-12 pt-6 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/share" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]">
          &larr; Back to Fellowship
        </Link>

        <div className="mt-3 max-w-3xl">
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Sabbath School</h1>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section className="order-1 rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9 lg:col-span-2">
            <span className="rounded-full border border-[#b36b3c]/30 bg-[#f7f4ee] px-3.5 py-1 text-xs font-semibold text-[#b36b3c]">Quarter {currentInfo.quarter}</span>
            <h2 className="mt-3 flex items-center gap-2 text-2xl font-semibold"><span>📖</span> Youth &amp; Adult Resources</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {adultResources.map((item) => (
                <article key={item.title} className="flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee]/60 p-5 transition hover:border-[#b36b3c] hover:bg-white sm:col-span-2">
                  <div>
                    <div className="flex items-center gap-2"><span className="text-xl">{item.icon}</span><h3 className="font-semibold">{item.title}</h3></div>
                    <p className="mt-1 text-xs leading-5 text-[#617068]">{item.text}</p>
                  </div>
                  <a href={item.href} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#b36b3c] px-4 py-2.5 text-center text-xs font-semibold text-white transition hover:bg-[#96552e]">
                    {item.buttonText} <span>&rarr;</span>
                  </a>
                </article>
              ))}
            </div>
          </section>

          <section className="order-2 rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9 lg:col-span-2">
            <span className="rounded-full border border-[#b36b3c]/30 bg-[#f7f4ee] px-3.5 py-1 text-xs font-semibold text-[#b36b3c]">Quarter {currentInfo.quarter} · Week {currentInfo.week}</span>
            <h2 className="mt-3 flex items-center gap-2 text-2xl font-semibold"><span>👶</span> Children&apos;s Resources</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {childrenDivisions.map((division) => (
                <article key={division.division} className="rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee]/60 p-5">
                  <div className="flex items-center gap-3"><span className="text-2xl">{division.icon}</span><div><h3 className="font-semibold">{division.division}</h3><p className="text-xs text-[#617068]">{division.age}</p></div></div>
                  <div className="mt-4 flex gap-2">
                    <a href={division.studentsLink} target="_blank" rel="noreferrer" className="flex-1 rounded-xl bg-[#b36b3c] px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-[#96552e]">Student lesson</a>
                    <a href={division.teachersLink} target="_blank" rel="noreferrer" className="flex-1 rounded-xl border border-[#c9c5bb] bg-white px-3 py-2 text-center text-xs font-semibold transition hover:border-[#b36b3c]">Teacher lesson</a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
