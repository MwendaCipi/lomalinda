"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import { NavRail } from "./nav-rail";
import { AppTopBar } from "./app-topbar";
import { MobileTabBar } from "./mobile-tab-bar";
import { normalizePath } from "@/lib/paths";
import { useHeaderData } from "@/hooks/use-header-data";

/**
 * The app shell — one rail, one page, no top bar.
 *
 * Every signed-in page in the app renders through this, whichever route group
 * it lives in, so navigation never changes shape between a section and the
 * console: the rail is on the left, the identity bar sits at the top of the
 * page column beside it, the page scrolls in what is left, and on a phone the
 * same rail slides in from the tab bar.
 *
 * The few surfaces that are the *public website* — the landing page and the
 * sign-in journey — keep their own header and get no rail: they are the shop
 * window, not the app.
 */
export type ScrollMode = "panel" | "pinned";

/**
 * How a route's page scrolls, stamped on the shell as `data-scroll-mode` so
 * globals.css can decide without any page carrying a scroll class:
 *
 * - `panel`   the page scrolls inside the panel beside the rail.
 * - `pinned`  app-like: the page fills the panel and its own lists scroll
 *             (the office console and the signed-in giving page).
 */
export function scrollModeForPath(pathname: string): ScrollMode {
  if (pathname.startsWith("/administration")) return "pinned";
  if (pathname === "/give") return "pinned";
  return "panel";
}

/** The public website: the landing page and the sign-in surfaces. */
const WEBSITE_PREFIXES = ["/login", "/create-account", "/forgot-password", "/reset-password", "/accept-invite"];

export function isPublicWebsite(pathname: string): boolean {
  return pathname === "/" || WEBSITE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * The forced profile update is a modal journey, not a page to wander from:
 * while it is up the member gets the form and nothing else — no rail to leave
 * through, no tab bar covering the submit button.
 */
const LOCKED_PREFIXES = ["/complete-profile"];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = normalizePath(usePathname());
  const { hasToken } = useHeaderData();
  /**
   * The drawer remembers the page it was opened on, not a boolean: arriving
   * somewhere else closes it by derivation, so a route change needs no effect
   * and the drawer can never linger over the page it navigated to.
   */
  const [drawerOpenedAt, setDrawerOpenedAt] = useState<string | null>(null);
  const menuOpen = drawerOpenedAt === pathname;
  const setMenuOpen = (open: boolean) => setDrawerOpenedAt(open ? pathname : null);
  const mode = scrollModeForPath(pathname);

  // The rail is for members in the app. The website keeps its own header, and
  // the forced-profile gate shows nothing but the form.
  const locked = LOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const showRail = hasToken && !isPublicWebsite(pathname) && !locked;

  if (!showRail) return <>{children}</>;

  return (
    <>
      <div
        className="app-shell flex min-h-0 flex-1 flex-col pb-24 md:h-full md:overflow-hidden md:pb-0"
        data-scroll-mode={mode}
      >
        <div className="app-shell-body flex min-h-0 flex-1">
          <NavRail open={menuOpen} onClose={() => setDrawerOpenedAt(null)} />
          {/* The bar lives inside the content column, not across the window:
              it starts after the rail, so nothing is drawn above it. */}
          <div className="app-panel-column">
            <AppTopBar />
            <div className="app-panel">{children}</div>
          </div>
        </div>
      </div>
      <MobileTabBar menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(!menuOpen)} />
    </>
  );
}
