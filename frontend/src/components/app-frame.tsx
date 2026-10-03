"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { NavRail } from "./nav-rail";
import { AppTopBar } from "./app-topbar";
import { MobileTabBar } from "./mobile-tab-bar";
import { SectionNav } from "./sub-nav";
import { pageHeaderFor, railFor, type RailRow } from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { useDepartments, useMyDepartments } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { useRailHere } from "@/hooks/use-rail-location";

type PageHeaderHeading = { label: string; description?: string };

type PageHeaderContextType = {
  setHeaderRightAction: (node: React.ReactNode) => void;
  setCustomToggles: (node: React.ReactNode) => void;
  /**
   * Let a page name itself, overriding the heading its rail row would give it.
   * A desk that answers several views under one route (the treasury's six, say)
   * uses this so the heading follows the view the visitor chose rather than
   * staying fixed on whichever row led here — otherwise pressing "Individual
   * Givings" leaves the page titled after the ledger it sits in.
   */
  setCustomHeader: (heading: PageHeaderHeading | null) => void;
};

const PageHeaderContext = createContext<PageHeaderContextType>({
  setHeaderRightAction: () => {},
  setCustomToggles: () => {},
  setCustomHeader: () => {},
});

export function usePageHeader() {
  return useContext(PageHeaderContext);
}

export type ScrollMode = "panel" | "pinned";

export function scrollModeForPath(pathname: string): ScrollMode {
  if (pathname.startsWith("/administration")) return "pinned";
  if (pathname === "/give") return "pinned";
  if (pathname === "/support/in-kind") return "pinned";
  return "panel";
}

const WEBSITE_PREFIXES = ["/login", "/create-account", "/forgot-password", "/reset-password", "/accept-invite"];

export function isPublicWebsite(pathname: string): boolean {
  return pathname === "/" || WEBSITE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

const LOCKED_PREFIXES = ["/complete-profile"];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = normalizePath(usePathname());
  const { me, hasToken } = useHeaderData();
  const mode = scrollModeForPath(pathname);

  const [headerRightAction, setHeaderRightAction] = useState<React.ReactNode>(null);
  const [customToggles, setCustomToggles] = useState<React.ReactNode>(null);
  const [customHeader, setCustomHeader] = useState<PageHeaderHeading | null>(null);

  // The setters never change identity, so the context value must not either.
  // A fresh object on every shell render re-renders every page that injects a
  // header control or a toggle strip — and a page whose effect depends on a
  // value it rebuilds each render (a filtered array, say) then loops: effect →
  // `setHeaderRightAction` → shell re-render → new context → page re-render →
  // effect. One stable value breaks the loop for every desk at once.
  const pageHeaderSlots = useMemo(
    () => ({ setHeaderRightAction, setCustomToggles, setCustomHeader }),
    [setHeaderRightAction, setCustomToggles, setCustomHeader]
  );

  useEffect(() => {
    setHeaderRightAction(null);
    setCustomToggles(null);
    setCustomHeader(null);
  }, [pathname]);

  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  const myDepartments = useMyDepartments();
  const departments = useDepartments();
  const entries = railFor({ roles, departmentCodes: myDepartments }, departments);
  const here = useRailHere(pathname, entries);

  const section = here.group ? entries.find((entry) => entry.label === here.group) ?? null : null;
  // The row that is "here", whether it sits inside a section's list (the
  // clerk's pages) or stands on its own (a department's desk, whose rail row
  // is top-level). Reading both is what lets a department's desk show its own
  // heading instead of falling back to the console's.
  const railRows: RailRow[] = entries.flatMap((entry) =>
    "items" in entry && entry.items ? entry.items : "href" in entry && entry.href ? [entry as RailRow] : []
  );
  const hereItem = railRows.find((item) => item.href === here.href) ?? null;
  const pageHeader = hereItem?.description
    ? { label: hereItem.label, description: hereItem.description }
    : pageHeaderFor(pathname);
  // A page that names itself wins over the rail row that led here.
  const header = customHeader ?? pageHeader;
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

  const locked = LOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const showRail = hasToken && !isPublicWebsite(pathname) && !locked;

  if (!showRail) return <>{children}</>;

  return (
    <PageHeaderContext.Provider value={pageHeaderSlots}>
      <div
        className="app-shell flex min-h-0 flex-1 flex-col pb-24 md:h-full md:overflow-hidden md:pb-0"
        data-scroll-mode={mode}
      >
        <div className="app-shell-body flex min-h-0 flex-1">
          <NavRail />
          <div className="app-panel-column">
            <AppTopBar />
            <div className="app-content">
              {(header || headerRightAction) && (
                // A phone spends its height on the page, not on the chrome: the
                // heading and its description ride the wider screens only, and a
                // header with nothing left on a phone (no controls) steps out
                // entirely. The row of toggles below still names the place.
                <div
                  className={`shrink-0 bg-white px-3 py-2.5 sm:px-5 sm:py-3.5 border-b border-sand-line flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    headerRightAction ? "" : "hidden sm:flex"
                  }`}
                >
                  {header && (
                    <div className="hidden sm:block">
                      <h1 className="text-xl font-semibold tracking-tight text-bark sm:text-2xl">{header.label}</h1>
                      {header.description && (
                        <p className="mt-0.5 text-xs text-moss sm:text-sm">{header.description}</p>
                      )}
                    </div>
                  )}
                  {headerRightAction && (
                    <div className="shrink-0 w-full sm:w-auto flex flex-wrap items-center gap-2">
                      {headerRightAction}
                    </div>
                  )}
                </div>
              )}
              {(customToggles || sectionPages.length > 1) && (
                <div className="shrink-0 border-b border-sand-line bg-white px-3 sm:px-5">
                  {customToggles ? (
                    <div className="pt-2">{customToggles}</div>
                  ) : (
                    <SectionNav
                      label={`${section?.label ?? ""} pages`}
                      activeHref={here.href}
                      items={sectionPages}
                    />
                  )}
                </div>
              )}
              <div className="app-panel">{children}</div>
            </div>
          </div>
        </div>
      </div>
      <MobileTabBar />
    </PageHeaderContext.Provider>
  );
}
