"use client";

import { usePathname } from "next/navigation";

import { NavRail } from "./nav-rail";
import { AppTopBar } from "./app-topbar";
import { MobileTabBar } from "./mobile-tab-bar";
import { SectionNav } from "./sub-nav";
import { railFor } from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { useDepartments, useMyDepartments } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { useRailHere } from "@/hooks/use-rail-location";

/**
 * The app shell — one rail, one page, one strip between them.
 *
 * Every signed-in page in the app renders through this, whichever route group
 * it lives in, so navigation never changes shape between a section and the
 * console: the rail (flat, one row per place) is on the left, the identity bar
 * sits at the top of the page column beside it, and under the bar is the strip
 * of the place you are in — the pages that used to hang under the rail's row.
 * The page scrolls in what is left. On a phone the rail steps aside and every
 * tab is ordinary navigation: the strip on the page carries a section's
 * siblings, and the console's overview cards carry its desks.
 *
 * The strip rides the top of the content card — inside it, on its surface, above
 * the page — rather than in a band of its own between the bar and the card. It
 * sits outside the scrolling panel either way, so it stays put in both scroll
 * modes and no page has to draw navigation of its own.
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
 *             (the office console and the signed-in giving pages).
 */
export function scrollModeForPath(pathname: string): ScrollMode {
  if (pathname.startsWith("/administration")) return "pinned";
  if (pathname === "/give") return "pinned";
  if (pathname === "/support/in-kind") return "pinned";
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
  const { me, hasToken } = useHeaderData();
  const mode = scrollModeForPath(pathname);

  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  const myDepartments = useMyDepartments();
  const departments = useDepartments();
  const entries = railFor({ roles, departmentCodes: myDepartments }, departments);
  const here = useRailHere(pathname, entries);
  /**
   * The place you are in. Its pages are the strip at the top of the content
   * card, at every width — on a phone exactly as Materials renders its shelf
   * toggles, so a section's siblings are one glance away without opening any
   * menu. A place with a single page gets no strip: a toggle that switches to
   * itself is noise.
   */
  const section = here.group ? entries.find((entry) => entry.label === here.group) ?? null : null;
  const sectionPages = (section && "items" in section && section.items ? section.items : [])
    .filter((item) => Boolean(item.href))
    .map((item) => ({
      key: item.href as string,
      href: item.href as string,
      label: item.label,
      short: item.short,
      icon: item.icon,
      help: item.label,
    }));

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
          <NavRail />
          {/* The bar lives inside the content column, not across the window:
              it starts after the rail, so nothing is drawn above it. */}
          <div className="app-panel-column">
            <AppTopBar />
            {/* The content card: the place's strip at its top, the page under
                it. Both are inside the same surface, so the tabs read as the
                card's first row rather than chrome above it. */}
            <div className="app-content">
              {sectionPages.length > 1 && (
                /* The section's pages as the card's top row, at every width —
                   on a phone the same chip strip Materials uses for its
                   shelves, so no section needs a card sheet of its own. */
                <div className="shrink-0 border-b border-sand-line bg-white px-3 py-3 sm:px-5">
                  <SectionNav
                    label={`${section?.label ?? ""} pages`}
                    activeHref={here.href}
                    items={sectionPages}
                  />
                </div>
              )}
              <div className="app-panel">{children}</div>
            </div>
          </div>
        </div>
      </div>
      <MobileTabBar />
    </>
  );
}
