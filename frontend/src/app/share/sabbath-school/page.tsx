"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const adultLessonLinks = [
  {
    title: "Lesson PDF",
    text: "Download the current Adult Bible Study Guide PDF for offline study.",
    href: `${API_URL}/api/members/lesson-pdf/adult/lesson/`,
    icon: "📄",
    buttonText: "Download Student PDF",
  },
  {
    title: "Teachers PDF",
    text: "Download the current teacher's preparation guide PDF.",
    href: `${API_URL}/api/members/lesson-pdf/adult/teachers/`,
    icon: "🎓",
    buttonText: "Download Teacher PDF",
  },
];

const childrenDivisions = [
  {
    division: "Beginners",
    age: "Ages 0 - 2",
    studentsLink: `${API_URL}/api/members/lesson-reading/children/beginner/students/`,
    teachersLink: `${API_URL}/api/members/lesson-reading/children/beginner/teachers/`,
    icon: "🍼",
  },
  {
    division: "Kindergarten",
    age: "Ages 3 - 4",
    studentsLink: `${API_URL}/api/members/lesson-reading/children/kindergarten/students/`,
    teachersLink: `${API_URL}/api/members/lesson-reading/children/kindergarten/teachers/`,
    icon: "🎨",
  },
  {
    division: "Primary",
    age: "Ages 5 - 9",
    studentsLink: `${API_URL}/api/members/lesson-reading/children/primary/students/`,
    teachersLink: `${API_URL}/api/members/lesson-reading/children/primary/teachers/`,
    icon: "✏️",
  },
  {
    division: "Junior / Earliteen",
    age: "Ages 10 - 14",
    studentsLink: `${API_URL}/api/members/lesson-reading/children/junior/students/`,
    teachersLink: `${API_URL}/api/members/lesson-reading/children/junior/teachers/`,
    icon: "📚",
  },
  {
    division: "Teens",
    age: "Ages 15 - 18",
    studentsLink: `${API_URL}/api/members/lesson-reading/children/teens/students/`,
    teachersLink: `${API_URL}/api/members/lesson-reading/children/teens/teachers/`,
    icon: "🎓",
  },
];

export default function SabbathSchoolPage() {
  const [currentInfo, setCurrentInfo] = useState({ quarter: 3, week: 6 });

  useEffect(() => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const quarterStart = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
    const week = Math.min(
      Math.max(
        Math.ceil((now.getTime() - quarterStart.getTime()) / (1000 * 3600 * 24 * 7)),
        1
      ),
      13
    );
    setCurrentInfo({ quarter, week });
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pb-16 pt-8 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/share"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          &larr; Back to Fellowship
        </Link>

        <div className="mt-4 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">
            Fellowship &amp; Study
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-5xl">
            Sabbath School
          </h1>
          <p className="mt-2 text-base leading-7 text-[#617068]">
            Access this quarter&apos;s Bible study guides and weekly mission stories for adults and children below.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-12">
          {/* Section 3: Adult Lesson */}
          <section className="order-3 rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-[#f7f4ee] border border-[#b36b3c]/30 px-3.5 py-1 text-xs font-semibold text-[#b36b3c]">
                Quarter {currentInfo.quarter}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-[#26352f] flex items-center gap-2">
              <span>📖</span> Adult Lesson
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-[#617068]">
              Download the current Adult Bible Study Guide PDF and teacher preparation materials.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {adultLessonLinks.map((item) => (
                <div
                  key={item.title}
                  className="flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee]/60 p-5 transition hover:border-[#b36b3c] hover:bg-white"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{item.icon}</span>
                      <h3 className="font-semibold text-[#26352f]">{item.title}</h3>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#617068]">{item.text}</p>
                  </div>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#b36b3c] px-4 py-2.5 text-center text-xs font-semibold text-white transition hover:bg-[#96552e]"
                  >
                    <span>{item.buttonText}</span>
                    <span>&rarr;</span>
                  </a>
                </div>
              ))}
            </div>
          </section>

          {/* Section 4: Children's Lesson */}
          <section className="order-4 rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-[#f7f4ee] border border-[#b36b3c]/30 px-3.5 py-1 text-xs font-semibold text-[#b36b3c]">
                Quarter {currentInfo.quarter} · Week {currentInfo.week}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-[#26352f] flex items-center gap-2">
              <span>👶</span> Children&apos;s Lesson
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-[#617068]">
              Bible study guides for each children&apos;s age division, featuring student and teacher resources.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {childrenDivisions.map((division) => (
                <div
                  key={division.division}
                  className="rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee]/60 p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{division.icon}</span>
                    <div>
                      <h3 className="font-semibold text-[#26352f]">{division.division}</h3>
                      <p className="text-xs text-[#617068]">{division.age}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <a
                      href={division.studentsLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded-xl bg-[#b36b3c] px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-[#96552e]"
                    >
                      Student lesson
                    </a>
                    <a
                      href={division.teachersLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded-xl border border-[#c9c5bb] bg-white px-3 py-2 text-center text-xs font-semibold text-[#26352f] transition hover:border-[#b36b3c]"
                    >
                      Teacher lesson
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 1: Adult Mission Story */}
          <section className="order-1 rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-[#b36b3c]/10 px-3.5 py-1 text-xs font-semibold text-[#b36b3c]">
                Sabbath Mission Reading
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-[#26352f] flex items-center gap-2">
              <span>🌍</span> Adult Mission Story
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-[#617068]">
              Read the current weekly mission story from global mission fields written for youth and adults.
            </p>
            <div className="mt-6">
              <a
                href={`${API_URL}/api/members/mission-reading/adults/`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#b36b3c] px-6 py-3 text-xs font-semibold text-white transition hover:bg-[#96552e]"
              >
                <span>Read Adult Mission Story</span>
                <span>&rarr;</span>
              </a>
            </div>
          </section>

          {/* Section 2: Children Mission Story */}
          <section className="order-2 rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-[#b36b3c]/10 px-3.5 py-1 text-xs font-semibold text-[#b36b3c]">
                Sabbath Mission Reading
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-[#26352f] flex items-center gap-2">
              <span>🎈</span> Children Mission Story
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-[#617068]">
              Read the current weekly mission story specially written for children.
            </p>
            <div className="mt-6">
              <a
                href={`${API_URL}/api/members/mission-reading/children/`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#b36b3c] px-6 py-3 text-xs font-semibold text-white transition hover:bg-[#96552e]"
              >
                <span>Read Children Mission Story</span>
                <span>&rarr;</span>
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
