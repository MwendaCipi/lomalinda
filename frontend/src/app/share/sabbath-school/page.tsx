"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const adultQuarterly = {
  quarter: "Current Quarter",
  title: "Adult Bible Study Guide",
  subtitle: "Daily lesson study & weekly discussion guides",
  link: "https://sabbath.school",
};

const childrenDivisions = [
  {
    division: "Beginners",
    age: "Ages 0 - 2",
    studentsLink: "https://beginner.aliveinjesus.info/students",
    teachersLink: "https://beginner.aliveinjesus.info/teachers",
    icon: "🍼",
  },
  {
    division: "Kindergarten",
    age: "Ages 3 - 4",
    studentsLink: "https://kindergarten.aliveinjesus.info/students",
    teachersLink: "https://kindergarten.aliveinjesus.info/teachers",
    icon: "🎨",
  },
  {
    division: "Primary",
    age: "Ages 5 - 9",
    studentsLink: "https://primary.aliveinjesus.info/students",
    teachersLink: "https://primary.aliveinjesus.info/teachers",
    icon: "✏️",
  },
  {
    division: "Junior / Earliteen",
    age: "Ages 10 - 14",
    studentsLink: "https://junior.aliveinjesus.info/students",
    teachersLink: "https://junior.aliveinjesus.info/teachers",
    icon: "📚",
  },
];

const missionReadings = [
  {
    target: "Youth & Adults",
    title: "Youth & Adult Mission Story",
    description: "Read this Sabbath's mission story for youth and adults.",
    link: "https://adventistmission.org/mission-awareness/mission-quarterlies/youth-and-adult/articles",
    icon: "🌍",
    buttonText: "Read Adult Mission Story",
  },
  {
    target: "Children",
    title: "Children's Mission Story",
    description: "Read this Sabbath's mission story for children.",
    link: "https://adventistmission.org/mission-awareness/mission-quarterlies/children/articles/",
    icon: "🎈",
    buttonText: "Read Children Mission Story",
  },
];

export default function SabbathSchoolPage() {
  const [currentInfo, setCurrentInfo] = useState<{ quarter: number; week: number }>({
    quarter: 3,
    week: 6,
  });

  useEffect(() => {
    const now = new Date();
    const month = now.getMonth();
    const quarter = Math.floor(month / 3) + 1;
    const quarterStartMonth = (quarter - 1) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterStartMonth, 1);
    const diffInDays = Math.floor((now.getTime() - quarterStart.getTime()) / (1000 * 3600 * 24));
    const week = Math.min(Math.max(Math.ceil(diffInDays / 7), 1), 13);
    setCurrentInfo({ quarter, week });
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-8 pb-16 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Back link */}
        <Link
          href="/share"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Fellowship</span>
        </Link>

        {/* Page Header */}
        <div className="mt-4 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">
            Fellowship &amp; Study
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-5xl">
            Sabbath School
          </h1>
          <p className="mt-2 text-base leading-7 text-[#617068]">
            Access current quarter Bible study lessons for adults and children, plus this Sabbath&apos;s mission reading.
          </p>
        </div>

        <div className="mt-8 space-y-8">
          {/* 1. Adult Sabbath School Lesson */}
          <section className="rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="rounded-full bg-[#f7f4ee] px-3.5 py-1 text-xs font-semibold text-[#b36b3c]">
                  Quarter {currentInfo.quarter}
                </span>
                <h2 className="mt-3 text-2xl font-semibold text-[#26352f]">
                  📖 {adultQuarterly.title}
                </h2>
                <p className="mt-1 text-sm text-[#617068]">{adultQuarterly.subtitle}</p>
              </div>
              <a
                href={adultQuarterly.link}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-[#b36b3c] px-6 py-3 text-xs font-semibold text-white transition hover:bg-[#96552e]"
              >
                Read Adult Lesson (sabbath.school) &rarr;
              </a>
            </div>
          </section>

          {/* 2. Children's Sabbath School Lessons (Alive in Jesus) */}
          <section className="rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-[#26352f]">
                  👶 Children&apos;s Sabbath School Lessons (Alive in Jesus)
                </h2>
                <p className="mt-1 text-sm text-[#617068]">
                  Sabbath School study guides and resources for students and teachers across all age divisions.
                </p>
              </div>
              <span className="rounded-full bg-[#b36b3c]/10 px-3.5 py-1 text-xs font-semibold text-[#b36b3c]">
                Quarter {currentInfo.quarter} • Week {currentInfo.week}
              </span>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
              {childrenDivisions.map((division) => (
                <div
                  key={division.division}
                  className="flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee]/60 p-6 transition hover:border-[#b36b3c] hover:bg-white hover:shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-3xl">{division.icon}</span>
                      <span className="rounded-full bg-[#f7f4ee] px-3 py-1 text-[11px] font-semibold text-[#617068]">
                        {division.age}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-[#26352f]">
                      {division.division}
                    </h3>
                    <p className="mt-1 text-xs text-[#617068]">
                      Quarter {currentInfo.quarter} • Week {currentInfo.week}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 pt-2 border-t border-[#dfdbd1]/60">
                    <a
                      href={`${division.studentsLink}#quarter${currentInfo.quarter}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-[120px] rounded-xl bg-[#b36b3c] px-3.5 py-2.5 text-center text-xs font-semibold text-white transition hover:bg-[#96552e]"
                    >
                      🎓 Students Guide
                    </a>
                    <a
                      href={`${division.teachersLink}#quarter${currentInfo.quarter}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-[120px] rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-center text-xs font-semibold text-[#26352f] transition hover:border-[#b36b3c]"
                    >
                      🍎 Teachers Guide
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 3. Mission Reading for Coming Sabbath */}
          <section className="rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9">
            <div className="max-w-2xl">
              <span className="rounded-full bg-[#b36b3c]/10 px-3.5 py-1 text-xs font-semibold text-[#b36b3c]">
                🌐 Sabbath Mission Reading
              </span>
              <h2 className="mt-3 text-2xl font-semibold text-[#26352f]">
                Adventist Mission Quarterlies
              </h2>
              <p className="mt-1 text-sm text-[#617068]">
                Read current weekly mission stories for youth, adults, and children.
              </p>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {missionReadings.map((mission) => (
                <a
                  key={mission.target}
                  href={mission.link}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee]/60 p-6 transition hover:border-[#b36b3c] hover:bg-white hover:shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-3xl">{mission.icon}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-[#26352f] group-hover:text-[#b36b3c]">
                      {mission.title}
                    </h3>
                    <p className="mt-1 text-xs text-[#617068]">
                      {mission.description}
                    </p>
                  </div>
                  <span className="mt-5 text-xs font-semibold text-[#b36b3c]">
                    {mission.buttonText} &rarr;
                  </span>
                </a>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
