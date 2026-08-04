"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const links = [
  ["About Us", "#about"],
  ["Beliefs", "#beliefs"],
  ["Calendar", "/calendar"],
  ["Ministries", "#ministries"],
  ["Prayer", "/prayer"],
  ["Contact Us", "#contact"],
] as const;

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#26352f] text-white shadow-lg">
      <nav className="mx-auto max-w-6xl px-6 py-4 lg:px-8" aria-label="Main navigation">
        <div className="flex items-center justify-between gap-6">
          <Link href="#top" className="flex min-w-0 items-center gap-3">
            <span className="h-10 w-10 shrink-0 overflow-hidden" aria-hidden="true"><Image src="/adventist-logo-white.svg" alt="" width={180} height={49} className="h-10 max-w-none w-auto" priority /></span>
            <span className="text-sm leading-tight text-white"><span className="block">SDA Church</span><span className="text-white/75">Loma Linda, Meru</span></span>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-medium md:flex">
            {links.map(([label, href]) => <a key={href} href={href} className="text-white/80 transition hover:text-[#f1c89e]">{label}</a>)}
            <Link href="/login" className="text-white/85 transition hover:text-[#f1c89e]">Member login</Link>
            <Link href="/give" className="font-semibold text-white/85 transition hover:text-[#f1c89e]">Give</Link>
          </div>

          <button type="button" className="rounded-full border border-white/35 px-4 py-2 text-sm font-medium text-white md:hidden" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)}>{open ? "Close" : "Menu"}</button>
        </div>

        {open && <div id="mobile-menu" className="mt-4 grid gap-2 border-t border-white/15 pt-4 md:hidden">
          {links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10">{label}</a>)}
          <Link href="/login" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10">Member login</Link>
          <Link href="/give" onClick={() => setOpen(false)} className="mt-1 px-3 py-2.5 text-sm font-semibold text-[#f1c89e] hover:text-white">Give</Link>
        </div>}
      </nav>
    </header>
  );
}
