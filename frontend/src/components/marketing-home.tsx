"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { NextGatheringCard } from "@/components/next-gathering-card";
import { ChurchGallery } from "@/components/church-gallery";
import { ClarionHero } from "@/components/clarion-hero";
import { ChurchMission } from "@/components/church-mission";
import { ChurchBeliefs } from "@/components/church-beliefs";
import { WeeklySchedule } from "@/components/weekly-schedule";

const ChurchLocation = dynamic(() => import("@/components/church-location"), { ssr: false });

// Every one of these is a page a visitor can actually open — no member sign-in
// required — so the landing page never sends anyone to a gate.
const ways = [
  {
    href: "/calendar",
    title: "Sabbath worship",
    text: "Programmes, times and what to expect on a Sabbath morning in Meru.",
  },
  {
    href: "/materials",
    title: "Sabbath School & Bible study",
    text: "Quarterly lessons, the hymnal and Bible reading to follow along at home.",
  },
  {
    href: "/requests",
    title: "Prayer & community care",
    text: "Send a prayer request, ask for a visit, or tell us about a practical need.",
  },
  {
    href: "/give",
    title: "Giving & campaigns",
    text: "Tithes and offerings by mobile money, and fund drives for the church's work.",
  },
  {
    href: "/share",
    title: "Share your story",
    text: "Testimonies, live services and the fellowship that happens between Sabbaths.",
  },
  {
    href: "/partnerships",
    title: "Partnerships",
    text: "Work with the church on ministry, community impact and shared initiatives.",
  },
];

const footerColumns = [
  {
    heading: "Worship",
    links: [
      { href: "/calendar", label: "Church calendar" },
      { href: "/materials", label: "Sabbath School material" },
      { href: "/share", label: "Share & fellowship" },
      { href: "/requests", label: "Prayer & care" },
    ],
  },
  {
    heading: "Giving",
    links: [
      { href: "/give", label: "Give" },
      { href: "/partnerships", label: "Partnerships" },
      { href: "/about", label: "About the church" },
    ],
  },
  {
    heading: "Church",
    links: [
      { href: "#beliefs", label: "What we believe" },
      { href: "#contact", label: "Contact & directions" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

export function MarketingHome() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <section id="top" className="mx-auto max-w-6xl px-6 pb-14 pt-6 sm:pt-10 lg:px-8 lg:pt-14">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          {/* The clarion call never changes — the gathering card carries the week's announcements. */}
          <ClarionHero />
          <div className="hero-card mt-6 sm:mt-0">
            <NextGatheringCard />
          </div>
        </div>
      </section>

      <ChurchGallery />

      {/* Welcome — who we are, in plain language, and where to go next. */}
      <section id="about" className="border-t border-[#dfdbd1] bg-white/60 px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Welcome home</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            An English-speaking Seventh-day Adventist church in Meru
          </h2>
          <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:gap-10">
            <p className="text-base leading-8 text-[#617068]">
              SDA Loma Linda, Meru is a congregation shaped by worship, prayer, Bible study, fellowship and
              service. We keep the Sabbath as a gift, study Scripture seriously, and carry the hope of
              Christ&apos;s return into everyday life in Meru and beyond.
            </p>
            <p className="text-base leading-8 text-[#617068]">
              Whether you are looking for a church home, coming back after time away, or simply curious about
              faith, come as you are. There is a seat for you, a class for your children, and a church family
              ready to walk with you — and to remember you in prayer.
            </p>
          </div>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="#contact"
              className="rounded-full bg-[#b36b3c] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#96552e]"
            >
              Plan your visit
            </Link>
            <Link
              href="#beliefs"
              className="rounded-full border border-[#c9c5bb] bg-white px-6 py-3.5 text-sm font-semibold transition hover:border-[#26352f]"
            >
              What we believe
            </Link>
            <Link
              href="/give"
              className="rounded-full border border-[#c9c5bb] bg-white px-6 py-3.5 text-sm font-semibold transition hover:border-[#26352f]"
            >
              Give
            </Link>
          </div>
        </div>
      </section>

      <ChurchMission />

      <ChurchBeliefs />

      {/* Ways to belong and serve — each card opens a real public page. */}
      <section id="belong" className="border-y border-[#dfdbd1] bg-white/60 px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Get involved</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Ways to belong and serve
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ways.map((way) => (
              <Link
                key={way.href}
                href={way.href}
                className="group flex flex-col rounded-[2rem] bg-white p-7 shadow-sm ring-1 ring-[#dfdbd1] transition hover:-translate-y-0.5 hover:ring-[#b9b3a6]"
              >
                <h3 className="text-xl font-semibold tracking-tight">{way.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-7 text-[#617068]">{way.text}</p>
                <span className="mt-6 text-sm font-semibold text-[#b36b3c] group-hover:underline">
                  Open &rarr;
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <WeeklySchedule />

      {/* Visit & contact — the #contact anchor the header links to. */}
      <section id="contact" className="bg-[#26352f] px-6 py-16 text-white lg:px-8 lg:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#f1c89e]">Visit us</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Plan your Sabbath with us</h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/75">
              We meet every Saturday — Sabbath School for children and adults, then Divine Service. Midweek
              vespers is online on Wednesday evening, and Friday vespers closes the week in the sanctuary.
            </p>
            <ul className="mt-7 space-y-3 text-sm text-white/80">
              {[
                "Sabbath School and Divine Service every Saturday",
                "Midweek vespers online, Friday vespers in person",
                "Children's classes and a warm welcome at the door",
                "Come as you are — there is no dress code to keep",
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#f1c89e]" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm font-semibold">
              <a className="text-[#f1c89e] hover:underline" href="mailto:hello@sdalomalinda.or.ke">
                hello@sdalomalinda.or.ke
              </a>
              <Link href="/requests" className="text-white/80 hover:text-white">
                Prayer &amp; care requests &rarr;
              </Link>
              <Link href="/login" className="text-white/80 hover:text-white">
                Member sign in &rarr;
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white/5 p-6 ring-1 ring-white/15 sm:p-8">
            <h3 className="text-xl font-semibold">Find us</h3>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Loma Linda, Meru — on the church grounds. Open the map for directions before you set off.
            </p>
            <div className="mt-6">
              <ChurchLocation />
            </div>
          </div>
        </div>
      </section>

      {/* Giving */}
      <section className="px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-[#b36b3c] px-8 py-12 text-white shadow-sm sm:px-12">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/80">Support the work</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Your giving keeps the ministry moving
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/85">
            Tithes, offerings and campaign gifts pay for ministry, outreach and the day-to-day life of the
            church in Meru. Give online, by mobile money, or talk to us about partnering with the church.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/give"
              className="rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#b36b3c] transition hover:bg-[#f7f4ee]"
            >
              Give now
            </Link>
            <Link
              href="/partnerships"
              className="rounded-full border border-white/40 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white"
            >
              Partner with us
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-[#26352f] px-6 pb-12 pt-16 text-white lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.6fr_0.6fr_0.6fr]">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 p-1">
                  <Image
                    src="/adventist-symbol.svg"
                    alt="SDA Church emblem"
                    width={36}
                    height={36}
                    className="h-full w-auto object-contain"
                  />
                </div>
                <div>
                  <p className="font-bold leading-tight">SDA Loma Linda, Meru</p>
                  <p className="text-xs text-white/60">Seventh-day Adventist Church</p>
                </div>
              </div>
              <p className="mt-5 max-w-sm text-sm leading-6 text-white/70">
                Questions, prayer needs, or a visit you would like to arrange? Our church family will be glad to
                hear from you.
              </p>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
                <a className="text-[#f1c89e] hover:underline" href="mailto:hello@sdalomalinda.or.ke">
                  hello@sdalomalinda.or.ke
                </a>
                <Link href="/login" className="text-white/80 hover:text-white">
                  Member sign in &rarr;
                </Link>
              </div>
            </div>

            {footerColumns.map((column) => (
              <div key={column.heading}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">{column.heading}</p>
                <ul className="mt-4 space-y-3 text-sm">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-white/75 transition hover:text-white">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Social media links */}
          <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-white/10 pt-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-white/60">Follow us</p>
            <a
              href="https://www.tiktok.com/@sdalomalinda"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:text-white"
              title="TikTok — Coming soon"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.28 8.28 0 004.84 1.56V6.86a4.85 4.85 0 01-1.07-.17z"/>
              </svg>
              TikTok
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/50">Coming soon</span>
            </a>
            <a
              href="https://www.youtube.com/@sdalomalinda"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:text-white"
              title="YouTube — Coming soon"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              YouTube
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/50">Coming soon</span>
            </a>
          </div>

          <p className="mt-10 border-t border-white/10 pt-5 text-xs text-white/50">
            &copy; 2026 SDA Loma Linda, Meru · Meru, Kenya
          </p>
        </div>
      </footer>
    </main>
  );
}
