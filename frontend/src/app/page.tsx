"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { NextGatheringCard } from "@/components/next-gathering-card";
import { ChurchGallery } from "@/components/church-gallery";

const ChurchLocation = dynamic(() => import("@/components/church-location"), { ssr: false });

const weeklyCalendar = [
  { day: "Wednesday", title: "Midweek Vespers", time: "8:00 PM - 9:00 PM", location: "Online" },
  { day: "Friday", title: "Friday Vespers", time: "5:30 PM - 6:30 PM", location: "Church sanctuary" },
  { day: "Saturday", title: "Sabbath worship", time: "8:00 AM - 4:00 PM", location: "Church grounds" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <section id="top" className="mx-auto max-w-6xl px-6 pb-12 pt-3 sm:pt-10 lg:px-8 lg:pt-14">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <h1 className="mt-2 text-2xl font-semibold leading-[1.15] tracking-tight sm:mt-6 sm:text-6xl">
              <span className="hero-line block">We love you.</span>
              <span className="hero-line block">We value you.</span>
              <span className="hero-line block">And we&apos;ll always pray for you.</span>
            </h1>
            <p className="hero-line mt-3 text-sm leading-6 text-[#617068] sm:mt-7 sm:text-lg sm:leading-8">We are a young, English-speaking church family in Meru, Kenya, learning to follow Jesus, care for our neighbours, and live with hope.</p>
            <div className="hero-line mt-4 flex flex-col gap-2.5 sm:mt-9 sm:flex-row sm:flex-wrap sm:gap-4">
              <Link href="#contact" className="flex items-center justify-center rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-center text-sm font-medium transition hover:border-[#26352f] hover:bg-[#eae6de] sm:px-6 sm:py-3.5 sm:text-base">Location & Contacts</Link>
              <Link href="/calendar" className="flex items-center justify-center rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-center text-sm font-medium transition hover:border-[#26352f] hover:bg-[#eae6de] sm:px-6 sm:py-3.5 sm:text-base">See Our Calendar</Link>
              <Link href="/login" className="flex items-center justify-center rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-center text-sm font-medium transition hover:border-[#26352f] hover:bg-[#eae6de] sm:px-6 sm:py-3.5 sm:text-base">Member Login</Link>
            </div>
          </div>
          <div className="hero-card mt-4 sm:mt-0"><NextGatheringCard /></div>
        </div>
      </section>

      <ChurchGallery />

      <section id="about" className="border-y border-[#dfdbd1] bg-white/60 px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-6xl"><p className="max-w-3xl text-2xl leading-relaxed tracking-tight sm:text-3xl">As a Seventh-day church, we honour the Sabbath, cherish Bible truth, and build a supportive community where everyone feels loved, valued, and remembered in prayer.</p></div>
      </section>

      <section id="beliefs" className="mx-auto max-w-6xl px-6 py-20 lg:px-8">
        <div className="max-w-2xl"><p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">What guides us</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Faith that shapes everyday life</h2></div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <article className="border-l-2 border-[#b36b3c] pl-6"><h3 className="text-xl font-semibold">The Bible</h3><p className="mt-3 text-sm leading-6 text-[#617068]">We look to Scripture as the foundation for knowing God and living with wisdom, grace, and purpose.</p></article>
          <article className="border-l-2 border-[#b36b3c] pl-6"><h3 className="text-xl font-semibold">The Sabbath</h3><p className="mt-3 text-sm leading-6 text-[#617068]">We set apart the seventh day to worship, rest, remember God&apos;s goodness, and grow together.</p></article>
          <article className="border-l-2 border-[#b36b3c] pl-6"><h3 className="text-xl font-semibold">Hope in Jesus</h3><p className="mt-3 text-sm leading-6 text-[#617068]">We believe Jesus brings forgiveness, healing, and the promise of a future filled with hope.</p></article>
        </div>
      </section>

      <section id="calendar" className="bg-white/60 px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-6xl"><div className="flex flex-wrap items-end justify-between gap-6"><div><p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Weekly calendar</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Connect & worship with us</h2></div><Link href="/calendar" className="text-sm font-semibold text-[#b36b3c] hover:underline">See all Sabbaths &rarr;</Link></div>
          <div className="mt-10 grid gap-8 border-t border-[#dfdbd1] md:grid-cols-3 md:gap-0 md:divide-x md:divide-[#dfdbd1]">
            {weeklyCalendar.map((item) => <article key={item.title} className="pt-6 md:px-7 md:first:pl-0 md:last:pr-0"><p className="text-sm font-semibold text-[#b36b3c]">{item.day}</p><h3 className="mt-3 text-xl font-semibold">{item.title}</h3><p className="mt-2 text-sm font-medium text-[#26352f]">{item.time}</p><p className="mt-1 text-sm text-[#617068]">{item.location}</p></article>)}
          </div>
        </div>
      </section>

      <footer id="contact" className="bg-[#26352f] px-6 py-14 text-white lg:px-8"><div className="mx-auto max-w-6xl"><p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#f1c89e]">Contact us</p><div className="mt-4 grid gap-8 md:grid-cols-[1fr_auto] md:items-end"><div><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">We would love to hear from you.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-white/70">Questions, prayer needs, visits, or ways to serve? Reach out and our church family will be glad to connect with you.</p></div><div className="grid gap-3 text-sm"><a className="font-semibold text-[#f1c89e] hover:underline" href="mailto:hello@lomalindachurch.org">hello@lomalindachurch.org</a><Link href="/community" className="text-white/75 hover:text-white">Community care &rarr;</Link><Link href="/calendar" className="text-white/75 hover:text-white">See our calendar &rarr;</Link></div></div><div id="location" className="mt-10 grid gap-10 pt-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center"><div><h3 className="text-xl font-semibold">Visit us in person</h3><p className="mt-3 text-sm leading-6 text-white/70">Use the map to find the church grounds and plan your visit.</p></div><ChurchLocation /></div><p className="mt-12 pt-5 text-xs text-white/50">&copy; 2026 Loma Linda Seventh-day Church</p></div></footer>
    </main>
  );
}
