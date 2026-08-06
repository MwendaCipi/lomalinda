"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const desktopLinks = [["About Us", "/about"], ["Beliefs", "/beliefs"], ["Calendar", "/calendar"], ["Announcements", "/announcements"]] as const;

const mobileNavItems = [
  ["About Us", "/about"],
  ["Beliefs", "/beliefs"],
  ["Calendar", "/calendar"],
  ["Ministries", "/ministries"],
  ["Spiritual", "/spiritual"],
  ["Financial", "/financial"],
  ["Announcements", "/announcements"],
  ["Member Login", "/login"],
] as const;

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
            {desktopLinks.slice(0, 3).map(([label, href]) => (
              <Link key={href} href={href} className={navItemClass(pathname === href)}>
                {label}
              </Link>
            ))}
            <Link href="/ministries" className={navItemClass(pathname.startsWith("/ministries"))}>
              Ministries
            </Link>
            <Link href="/spiritual" className={navItemClass(pathname.startsWith("/spiritual"))}>
              Spiritual
            </Link>
            <Link href="/financial" className={navItemClass(pathname.startsWith("/financial"))}>
              Financial
            </Link>
            {desktopLinks.slice(3).map(([label, href]) => (
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
          <div id="mobile-menu" className="mt-4 max-h-[calc(100vh-100px)] space-y-2.5 overflow-y-auto border-t border-white/15 pt-4 pb-6 md:hidden">
            {mobileNavItems.map(([label, href]) => {
              const active = pathname === href || (href !== "/login" && pathname.startsWith(href));
              const isLogin = href === "/login";
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex w-full items-center justify-between rounded-2xl border p-4 text-sm font-medium transition ${
                    isLogin
                      ? "border-[#b36b3c]/60 bg-[#b36b3c]/20 text-white hover:bg-[#b36b3c]/30"
                      : active
                      ? "border-[#b36b3c] bg-white/15 text-white"
                      : "border-white/15 bg-white/5 text-white/90 hover:bg-white/10"
                  }`}
                >
                  <span>{label}</span>
                  <span className={isLogin ? "text-[#f1c89e] font-semibold" : "text-[#b36b3c] font-semibold"}>
                    &rarr;
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </nav>
    </header>
  );
}
