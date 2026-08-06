"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [["About Us", "/about"], ["Beliefs", "/beliefs"], ["Calendar", "/calendar"], ["Announcements", "/announcements"]] as const;
const spiritualLinks = [["Prayer box", "/spiritual/prayer"], ["Request visitation", "/spiritual/visitation"], ["Child dedication", "/spiritual/child-dedication"], ["Testimonies", "/spiritual/testimonies"]] as const;
const ministryLinks = [["Adventist Youth Ministries", "/ministries/adventist-youth"], ["Adventist Possibility Ministries", "/ministries/possibility-ministries"], ["Adventist men ministries", "/ministries/adventist-men"], ["Adventist Women Ministries", "/ministries/adventist-women"], ["Church Choir", "/ministries/ensemble"], ["Chaplaincy", "/ministries/chaplaincy"]] as const;
const outreachLinks = [["Community Outreach", "/ministries/outreach#community-outreach"], ["Missions", "/ministries/outreach#missions"]] as const;

function navItemClass(active: boolean) {
  return active ? "rounded-full bg-white/15 px-3 py-1.5 text-white" : "text-white/80 transition hover:text-[#f1c89e]";
}



export function SiteNav({ open: controlledOpen, setOpen: controlledSetOpen }: { open?: boolean; setOpen?: (open: boolean) => void } = {}) {
  const pathname = usePathname();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledSetOpen ?? setInternalOpen;
  const memberLoginClass = navItemClass(pathname === "/login");

  return (
    <header className="border-b border-white/10 bg-[#26352f] text-white shadow-lg">
      <nav className="mx-auto max-w-6xl px-6 py-4 lg:px-8" aria-label="Main navigation">
        <div className="flex items-center justify-between gap-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="h-10 w-10 shrink-0 overflow-hidden" aria-hidden="true">
              <Image src="/adventist-logo-white.svg" alt="" width={180} height={49} className="h-10 max-w-none w-auto" priority />
            </span>
            <span className="text-sm leading-tight text-white">
              <span className="block">SDA Church</span>
              <span className="text-white/75">Loma Linda, Meru</span>
            </span>
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium md:flex">
            {links.slice(0, 3).map(([label, href]) => (
              <Link key={href} href={href} className={navItemClass(pathname === href)}>
                {label}
              </Link>
            ))}
            <Link href="/ministries" className={navItemClass(pathname.startsWith("/ministries") && pathname !== "/ministries/outreach")}>
              Ministries
            </Link>
            <Link href="/ministries/outreach" className={navItemClass(pathname.startsWith("/ministries/outreach"))}>
              Outreach
            </Link>
            <Link href="/spiritual" className={navItemClass(pathname.startsWith("/spiritual"))}>
              Spiritual
            </Link>
            {links.slice(3).map(([label, href]) => (
              <Link key={href} href={href} className="text-white/80 transition hover:text-[#f1c89e]">
                {label}
              </Link>
            ))}
            <Link href="/login" className={memberLoginClass}>
              Member login
            </Link>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/35 px-4 py-2 text-sm font-medium text-white md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(!open)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
        {open && (
          <div id="mobile-menu" className="mt-4 max-h-[calc(100vh-100px)] space-y-3 overflow-y-auto border-t border-white/15 pt-4 pb-6 md:hidden">
            {/* Quick Links Card Grid */}
            <div className="grid grid-cols-2 gap-2">
              {links.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 p-3 text-xs font-medium transition hover:border-[#b36b3c]/50 hover:bg-white/10 ${
                    pathname === href ? "border-[#b36b3c] bg-white/15 text-white" : "text-white/90"
                  }`}
                >
                  <span>{label}</span>
                  <span className="text-[#b36b3c]">&rarr;</span>
                </Link>
              ))}
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className={`col-span-2 flex items-center justify-between rounded-2xl border border-[#b36b3c]/40 bg-[#b36b3c]/20 p-3 text-xs font-semibold text-white transition hover:bg-[#b36b3c]/30 ${
                  pathname === "/login" ? "ring-1 ring-[#b36b3c]" : ""
                }`}
              >
                <span>Member Login</span>
                <span className="text-[#f1c89e]">&rarr;</span>
              </Link>
            </div>

            {/* Ministries Card Section */}
            <div className="rounded-2xl border border-white/15 bg-white/5 p-3.5">
              <Link
                href="/ministries"
                onClick={() => setOpen(false)}
                className="mb-2.5 flex items-center justify-between font-semibold text-sm text-white"
              >
                <span>Ministries</span>
                <span className="text-xs text-[#b36b3c]">View All &rarr;</span>
              </Link>
              <div className="grid gap-2">
                {ministryLinks.map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    <span>{label}</span>
                    <span className="text-white/40">&rarr;</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Outreach Card Section */}
            <div className="rounded-2xl border border-white/15 bg-white/5 p-3.5">
              <Link
                href="/ministries/outreach"
                onClick={() => setOpen(false)}
                className="mb-2.5 flex items-center justify-between font-semibold text-sm text-white"
              >
                <span>Outreach</span>
                <span className="text-xs text-[#b36b3c]">View All &rarr;</span>
              </Link>
              <div className="grid gap-2">
                {outreachLinks.map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    <span>{label}</span>
                    <span className="text-white/40">&rarr;</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Spiritual Card Section */}
            <div className="rounded-2xl border border-white/15 bg-white/5 p-3.5">
              <Link
                href="/spiritual"
                onClick={() => setOpen(false)}
                className="mb-2.5 flex items-center justify-between font-semibold text-sm text-white"
              >
                <span>Spiritual</span>
                <span className="text-xs text-[#b36b3c]">View All &rarr;</span>
              </Link>
              <div className="grid gap-2">
                {spiritualLinks.map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    <span>{label}</span>
                    <span className="text-white/40">&rarr;</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
