"use client";

import { usePathname } from "next/navigation";

/**
 * The app shell — the one element the scroll architecture keys on.
 *
 * It stamps `data-scroll-mode` on itself so globals.css can decide how the
 * page scrolls without any page carrying a scroll class:
 *
 * - `panel`     the default. Desktop is a fixed viewport and the page's own
 *               `md:h-screen md:overflow-hidden` panel scrolls inside it; on
 *               a phone the document scrolls naturally, clearing the tab bar.
 * - `pinned`    app-like at every width (administration, the contributions
 *               ledger, the signed-in giving page): the document never
 *               scrolls and the page's inner lists scroll.
 *
 * A new page needs nothing: it gets `panel` by default. A page that owns its
 * scrolling is opted in here, by route, in one line.
 */
export type ScrollMode = "panel" | "pinned";

export function scrollModeForPath(pathname: string): ScrollMode {
  if (pathname.startsWith("/administration")) return "pinned";
  return "panel";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  // Prerendering resolves usePathname per route, so the attribute is baked
  // into each page's static HTML — the viewport lock applies on first paint,
  // with no effect and no flash.
  const mode = scrollModeForPath(usePathname());

  return (
    <div
      className="app-shell flex-1 min-h-0 flex flex-col pb-24 md:pb-0"
      data-scroll-mode={mode}
    >
      {children}
    </div>
  );
}
