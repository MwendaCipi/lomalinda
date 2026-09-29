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
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-end gap-2 border-b border-white/10 bg-bark px-3 text-white shadow-sm sm:px-5">
      <NavIdentity />
    </header>
  );
}
