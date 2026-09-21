import Link from "next/link";

import { PublicSectionNav } from "@/components/public-section-nav";
import { aboutSectionLinks } from "@/config/site-sections";

const values = [
  ["Faith", "We follow Jesus, trust Scripture, and make room for questions, growth, and grace."],
  ["Belonging", "Everyone should find a welcoming church family where they are known, valued, and remembered in prayer."],
  ["Service", "We put faith into action by caring for our neighbours and responding to practical needs with compassion."],
  ["Hope", "We share the hope of the gospel and encourage one another through every season of life."],
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <section className="px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">About us</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">About SDA Loma Linda</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-[#617068]">
            A welcoming Seventh-day church family in Meru, growing together in faith, hope, and love.
          </p>
        </div>
      </section>

      <section className="px-6 py-12 lg:px-8 lg:py-14">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[2rem] bg-white p-7 shadow-sm ring-1 ring-[#dfdbd1] sm:p-9">
            <h2 className="text-2xl font-semibold tracking-tight">Our history</h2>
            <p className="mt-4 text-base leading-8 text-[#617068]">
              SDA Loma Linda is a community shaped by worship, prayer, Bible study, fellowship, and service. Our
              story continues through the people who gather here, the families we support, and the neighbours we serve.
            </p>
            <p className="mt-4 text-base leading-8 text-[#617068]">
              As the church grows, we remain committed to remembering where we have come from while making room for
              new people, new ministries, and new ways to share God&apos;s love in Meru and beyond.
            </p>
          </article>

          <article className="rounded-[2rem] bg-[#26352f] p-7 text-white shadow-sm sm:p-9">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#f1c89e]">Our purpose</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              A church for faith, friendship, and service.
            </h2>
            <p className="mt-5 text-sm leading-7 text-white/75">
              We worship God, nurture disciples, care for people, and take the hope of Jesus into our community.
            </p>
          </article>
        </div>
      </section>

      <section className="border-y border-[#dfdbd1] bg-white/60 px-6 py-12 lg:px-8 lg:py-14">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2">
          <article className="rounded-[2rem] bg-white p-7 shadow-sm ring-1 ring-[#dfdbd1] sm:p-9">
            <h2 className="text-2xl font-semibold tracking-tight">Our mission</h2>
            <p className="mt-4 text-base leading-8 text-[#617068]">
              Make disciples of Jesus Christ who live as His loving witnesses and proclaim to all people the
              everlasting gospel of the Three Angels&apos; Messages in preparation for His soon return (Matt 28:18-20,
              Acts 1:8, Rev 14:6-12).
            </p>
          </article>
          <article className="rounded-[2rem] bg-white p-7 shadow-sm ring-1 ring-[#dfdbd1] sm:p-9">
            <h2 className="text-2xl font-semibold tracking-tight">Our vision</h2>
            <p className="mt-4 text-base leading-8 text-[#617068]">
              In harmony with Bible revelation, Seventh-day Adventists see as the climax of God&apos;s plan the
              restoration of all His creation to full harmony with His perfect will and righteousness.
            </p>
          </article>
        </div>
      </section>

      <section className="px-6 py-14 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What guides us</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            {values.map(([title, text]) => (
              <article key={title} className="border-l-2 border-[#b36b3c] pl-6">
                <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#617068]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* The old About sidebar, now part of the page: the same four destinations. */}
      <PublicSectionNav
        eyebrow="Explore"
        title="More about our church"
        description="Our calendar, working with us, and how we handle the information you share."
        links={aboutSectionLinks}
        activeKey="about"
        className="border-t border-[#dfdbd1] bg-white/60"
      />

      <section className="px-6 pb-16 lg:px-8 lg:pb-20">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-[#26352f] px-8 py-12 text-white shadow-sm sm:px-12">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#f1c89e]">Come and see</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Come and be part of the story</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75">
            Join us for worship, explore our ministries, or reach out when you need prayer and care.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/calendar"
              className="rounded-full bg-[#b36b3c] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#96552e]"
            >
              See our calendar
            </Link>
            <Link
              href="/requests"
              className="rounded-full border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/50"
            >
              Prayer &amp; care requests
            </Link>
            <Link
              href="/give"
              className="rounded-full border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/50"
            >
              Give
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
