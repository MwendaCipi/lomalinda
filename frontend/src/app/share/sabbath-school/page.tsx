import Link from "next/link";

const adultQuarterly = {
  quarter: "Current Quarter",
  title: "Adult Bible Study Guide",
  subtitle: "Daily lesson study & weekly discussion guides",
  link: "https://sabbath.school",
};

const childrenDivisions = [
  { division: "Beginners", age: "Ages 0 - 2", link: "https://www.gracelink.net/beginner", icon: "🍼" },
  { division: "Kindergarten", age: "Ages 3 - 4", link: "https://www.gracelink.net/kindergarten", icon: "🎨" },
  { division: "Primary", age: "Ages 5 - 9", link: "https://www.gracelink.net/primary", icon: "✏️" },
  { division: "Junior / Earliteen", age: "Ages 10 - 14", link: "https://www.gracelink.net/junior", icon: "📚" },
];

const missionReadings = [
  {
    target: "Youth & Adults",
    title: "Youth & Adult Mission Quarterly",
    description: "Inspirational stories and reports from missionaries and communities across the globe for youth and adults.",
    link: "https://adventistmission.org/mission-awareness/mission-quarterlies/youth-and-adult/articles",
    icon: "🌍",
  },
  {
    target: "Children",
    title: "Children's Mission Quarterly",
    description: "Engaging weekly mission stories, illustrations, and cultural activities tailored for children's Sabbath School.",
    link: "https://adventistmission.org/mission-awareness/mission-quarterlies/children/articles/",
    icon: "🎈",
  },
];

export default function SabbathSchoolPage() {
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
                  {adultQuarterly.quarter}
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

          {/* 2. Children's Sabbath School Lessons (GraceLink) */}
          <section className="rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold text-[#26352f]">
                👶 Children&apos;s Sabbath School Lessons
              </h2>
              <p className="mt-1 text-sm text-[#617068]">
                GraceLink Sabbath School study guides and activities for children of all ages.
              </p>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {childrenDivisions.map((division) => (
                <a
                  key={division.division}
                  href={division.link}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee]/60 p-5 transition hover:border-[#b36b3c] hover:bg-white hover:shadow-sm"
                >
                  <div>
                    <span className="text-3xl">{division.icon}</span>
                    <h3 className="mt-3 text-lg font-semibold text-[#26352f] group-hover:text-[#b36b3c]">
                      {division.division}
                    </h3>
                    <p className="mt-1 text-xs text-[#617068]">{division.age}</p>
                  </div>
                  <span className="mt-4 text-xs font-semibold text-[#b36b3c]">
                    Open GraceLink &rarr;
                  </span>
                </a>
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
                Read current weekly mission stories and articles for youth, adults, and children.
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
                    <span className="text-3xl">{mission.icon}</span>
                    <h3 className="mt-3 text-lg font-semibold text-[#26352f] group-hover:text-[#b36b3c]">
                      {mission.title}
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-[#617068]">
                      {mission.description}
                    </p>
                  </div>
                  <span className="mt-5 text-xs font-semibold text-[#b36b3c]">
                    Read {mission.target} Mission Articles &rarr;
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
