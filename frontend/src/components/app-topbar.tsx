"use client";

import Image from "next/image";
import Link from "next/link";

import { NavIdentity } from "./nav-identity";

/**
 * The top bar — the app's identity strip.
 *
 * It carries no navigation: the rail owns the map, so this holds only what is
 * about *you* rather than *where* — the bell, the light/dark switch, the
 * accessibility options, install and the account menu. That split is why it
 * can sit inside the content column instead of spanning the window: it starts
 * where the rail ends, so the rail keeps the full height of the page and its
 * brand and first rows are never pushed down by chrome.
 *
 * A phone has no rail to start after, so the bar spans the width — and it
 * carries the church's own mark and name on the left, which is the only place
 * the app can say whose it is at that width. The same bar and the same two
 * words the rail's brand block shows, so nothing is introduced differently on
 * a phone.
 *
 * It wears `bark`, the church's dark chrome — the same colour the phone's tab
 * bar uses, so the two ends of the app read as one frame around the page.
 *
 * Its height is the rail's brand block (`h-16` there), so the bar's own bottom
 * hairline continues the line under the rail's logo instead of sitting a few
 * pixels above it.
 */
export function AppTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-bark px-3 text-white shadow-sm sm:px-5">
      {/* The way home, where the rail's brand would be. The symbol is white,
          so it sits in the same ghost tile the bar's own controls wear. */}
      <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 lg:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 p-1">
          <Image
            src="/adventist-symbol.svg"
            alt="SDA Church"
            width={32}
            height={32}
            className="h-full w-auto object-contain"
            priority
          />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm leading-tight tracking-tight text-white">SDA Church</span>
          <span className="block truncate text-[11px] leading-tight text-white/70">Loma Linda</span>
        </span>
      </Link>
      <NavIdentity />
    </header>
  );
}
