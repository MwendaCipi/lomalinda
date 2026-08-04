"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const links = [
  ["About Us", "#about"],
  ["Services & Schedule", "#schedule"],
  ["Ministries", "#ministries"],
] as const;

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#dfdbd1]/80 bg-[#f7f4ee]/95 backdrop-blur">
      <div className="border-b border-[#dfdbd1]/70 bg-[#26352f] px-6 py-2 text-center text-xs font-medium tracking-wide text-white/85">
        Sabbath worship every Saturday · 8:00 AM – 4:00 PM
      </div>
      <nav className="mx-auto max-w-6xl px-6 py-4 lg:px-8" aria-label="Main navigation">
        <div className="flex items-center justify-between gap-6">
          <Link href="#top" className="flex min-w-0 items-center gap-3">
            <Image src="/adventist-logo.svg" alt="Seventh-day Adventist Church" width={180} height={49} className="h-10 w-auto shrink-0" priority />
            <span className="hidden border-l border-[#c9c5bb] pl-3 text-sm font-semibold leading-tight text-[#26352f] sm:block">Loma Linda<br />Church</span>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-medium md:flex">
            {links.map(([label, href]) => <a key={href} href={href} className="transition hover:text-[#b36b3c]">{label}</a>)}
            <Link href="/login" className="rounded-full border border-[#c9c5bb] px-4 py-2.5 transition hover:border-[#26352f]">Member login</Link>
            <a href="#contact" className="rounded-full bg-[#b36b3c] px-5 py-2.5 text-white transition hover:bg-[#96552e]">Plan a visit</a>
          </div>

          <button type="button" className="rounded-full border border-[#c9c5bb] px-4 py-2 text-sm font-medium md:hidden" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)}>{open ? "Close" : "Menu"}</button>
        </div>

        {open && <div id="mobile-menu" className="mt-4 grid gap-2 border-t border-[#dfdbd1] pt-4 md:hidden">
          {links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white">{label}</a>)}
          <Link href="/login" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white">Member login</Link>
          <a href="#contact" onClick={() => setOpen(false)} className="mt-1 rounded-full bg-[#b36b3c] px-5 py-3 text-center text-sm font-medium text-white">Plan a visit</a>
        </div>}
      </nav>
    </header>
  );
}
