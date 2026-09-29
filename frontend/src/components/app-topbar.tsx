"use client";

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
 * On a phone there is no rail to start after, so the bar spans the width and
 * carries the same controls above the page.
 */
export function AppTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-end gap-2 border-b border-sand-line bg-white px-3 sm:px-5">
      <NavIdentity />
    </header>
  );
}
