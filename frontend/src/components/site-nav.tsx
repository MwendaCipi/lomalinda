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

function DesktopMenu({ label, href, items }: { label: string; href: string; items: readonly (readonly [string, string])[] }) {
  const pathname = usePathname();
  const active = pathname.startsWith(href);
  return (
    <div className="group relative">
      <Link href={href} className={`${navItemClass(active)} focus:text-[#f1c89e]`}>
        {label}
      </Link>
      <div className="invisible absolute left-1/2 top-full z-[60] w-64 -translate-x-1/2 pt-3 opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100">
        <div className="rounded-2xl border border-white/15 bg-[#26352f] p-3 shadow-2xl backdrop-blur-md">
          <div className="space-y-1.5">
            {items.map(([item, itemHref]) => (
              <Link
                key={itemHref}
                href={itemHref}
                className="group/item flex items-center justify-between rounded-xl border border-transparent bg-white/5 p-2.5 text-xs font-medium text-white/90 transition hover:border-[#b36b3c]/40 hover:bg-white/10 hover:text-white"
              >
                <span>{item}</span>
                <span className="text-[#b36b3c] opacity-0 transition group-hover/item:opacity-100">&rarr;</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
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
            <DesktopMenu label="Ministries" href="/ministries" items={ministryLinks} />
            <DesktopMenu label="Outreach" href="/ministries/outreach" items={outreachLinks} />
            <DesktopMenu label="Spiritual" href="/spiritual" items={spiritualLinks} />
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
          <div id="mobile-menu" className="mt-4 grid gap-2 border-t border-white/15 pt-4 md:hidden">
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium ${pathname === href ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/10"}`}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className={`rounded-xl px-3 py-2.5 text-sm font-medium ${pathname === "/login" ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/10"}`}
            >
              Member login
            </Link>
            <details className="rounded-xl px-3 py-2 text-sm text-white/85">
              <summary className="cursor-pointer font-medium">Ministries</summary>
              <div className="mt-2 grid gap-1.5 pl-2">
                {ministryLinks.map(([label, href]) => (
                  <Link key={href} href={href} onClick={() => setOpen(false)} className="block rounded-lg bg-white/5 p-2.5 text-xs text-white/80 hover:text-[#f1c89e]">
                    {label}
                  </Link>
                ))}
              </div>
            </details>
            <details className="rounded-xl px-3 py-2 text-sm text-white/85">
              <summary className="cursor-pointer font-medium">Outreach</summary>
              <div className="mt-2 grid gap-1.5 pl-2">
                {outreachLinks.map(([label, href]) => (
                  <Link key={href} href={href} onClick={() => setOpen(false)} className="block rounded-lg bg-white/5 p-2.5 text-xs text-white/80 hover:text-[#f1c89e]">
                    {label}
                  </Link>
                ))}
              </div>
            </details>
            <details className="rounded-xl px-3 py-2 text-sm text-white/85">
              <summary className="cursor-pointer font-medium">Spiritual</summary>
              <div className="mt-2 grid gap-1.5 pl-2">
                {spiritualLinks.map(([label, href]) => (
                  <Link key={href} href={href} onClick={() => setOpen(false)} className="block rounded-lg bg-white/5 p-2.5 text-xs text-white/80 hover:text-[#f1c89e]">
                    {label}
                  </Link>
                ))}
              </div>
            </details>
          </div>
        )}
      </nav>
    </header>
  );
}
