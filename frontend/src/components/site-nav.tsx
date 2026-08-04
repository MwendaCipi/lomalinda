"use client";

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
    <nav className="mx-auto max-w-6xl px-6 py-6 lg:px-8" aria-label="Main navigation">
      <div className="flex items-center justify-between">
        <Link href="#top" className="max-w-[15rem] text-lg font-bold leading-tight tracking-tight sm:text-xl">
          Loma Linda <span className="font-normal text-[#b36b3c]">Seventh-day Church</span>
        </Link>
        <div className="hidden items-center gap-7 text-sm font-medium md:flex">
          {links.map(([label, href]) => <a key={href} href={href} className="transition hover:text-[#b36b3c]">{label}</a>)}
          <Link href="/login" className="rounded-full border border-[#c9c5bb] px-4 py-2.5 transition hover:border-[#26352f]">Member login</Link>
          <a href="#contact" className="rounded-full bg-[#26352f] px-5 py-2.5 text-white transition hover:bg-[#3c5147]">Plan a visit</a>
        </div>
        <button type="button" className="rounded-full border border-[#c9c5bb] px-4 py-2 text-sm font-medium md:hidden" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)}>{open ? "Close" : "Menu"}</button>
      </div>
      {open && <div id="mobile-menu" className="mt-5 grid gap-2 border-t border-[#dfdbd1] pt-4 md:hidden">
        {links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white">{label}</a>)}
        <Link href="/login" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white">Member login</Link>
        <a href="#contact" onClick={() => setOpen(false)} className="mt-1 rounded-full bg-[#26352f] px-5 py-3 text-center text-sm font-medium text-white">Plan a visit</a>
      </div>}
    </nav>
  );
}
