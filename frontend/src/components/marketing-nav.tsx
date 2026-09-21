"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LayoutDashboard, LogIn, Menu, X } from "lucide-react";
import { AccessibilityMenu } from "./accessibility-menu";

const marketingLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/give", label: "Give" },
  { href: "/#contact", label: "Contact" },
];

/**
 * Header for the public website (the marketing pages).
 *
 * Deliberately free of system chrome: no notifications bell, no account
 * popover and — importantly — no mobile bottom tab bar. Visitors get a
 * "Sign in" button; signed-in members get a link to their system dashboard.
 */
export function MarketingNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem("access_token")));
  }, [pathname]);

  // Never leave the mobile menu hanging open across navigations.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const accountHref = signedIn ? "/dashboard" : "/login";
  const accountLabel = signedIn ? "Dashboard" : "Sign in";
  const AccountIcon = signedIn ? LayoutDashboard : LogIn;

  const isActive = (href: string) => {
    const [path] = href.split("#");
    return path === "/" ? pathname === "/" : pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#26352f] text-white shadow-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 min-w-0 sm:gap-3">
          <div className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 flex items-center justify-center rounded-xl bg-white/10 p-1 border border-white/15">
            <Image
              src="/adventist-symbol.svg"
              alt="SDA Church Emblem"
              width={36}
              height={36}
              className="h-full w-auto object-contain"
              priority
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-white text-sm sm:text-base tracking-tight leading-tight truncate">
              SDA Church
            </span>
            <span className="text-white/75 text-[11px] sm:text-xs leading-tight truncate">
              Loma Linda, Meru
            </span>
          </div>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center gap-2 lg:gap-4" aria-label="Website">
          {marketingLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                isActive(link.href)
                  ? "bg-white/15 text-white"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Account action + mobile menu toggle */}
        <div className="flex items-center gap-3">
          <AccessibilityMenu buttonClassName="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors focus:outline-none" />
          <Link
            href={accountHref}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#f1c89e] px-3.5 py-2 text-xs font-bold text-[#26352f] transition-colors hover:bg-white sm:text-sm"
          >
            <AccountIcon className="h-3.5 w-3.5" />
            <span>{accountLabel}</span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none md:hidden"
            aria-label={menuOpen ? "Close website menu" : "Open website menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <nav className="border-t border-white/10 bg-[#26352f] px-4 pb-4 pt-2 md:hidden" aria-label="Website mobile">
          <div className="flex flex-col">
            {marketingLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${
                  isActive(link.href)
                    ? "bg-white/15 text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>{link.label}</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            ))}
          </div>
          <div className="mt-3 border-t border-white/10 pt-3">
            <Link
              href={signedIn ? "/dashboard" : "/login"}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#f1c89e] px-4 py-2.5 text-sm font-bold text-[#26352f] transition-colors hover:bg-white"
            >
              <AccountIcon className="h-4 w-4" />
              <span>{accountLabel}</span>
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
