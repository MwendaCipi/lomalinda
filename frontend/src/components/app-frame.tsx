"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { NavRail } from "./nav-rail";
import { AppTopBar } from "./app-topbar";
import { MobileTabBar } from "./mobile-tab-bar";
import { SectionNav } from "./sub-nav";
import { pageHeaderFor, railFor } from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { useDepartments, useMyDepartments } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { useRailHere } from "@/hooks/use-rail-location";

type PageHeaderContextType = {
  setHeaderRightAction: (node: React.ReactNode) => void;
  setCustomToggles: (node: React.ReactNode) => void;
};

const PageHeaderContext = createContext<PageHeaderContextType>({
  setHeaderRightAction: () => {},
  setCustomToggles: () => {},
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

  useEffect(() => {
    setHeaderRightAction(null);
    setCustomToggles(null);
  }, [pathname]);

  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  const myDepartments = useMyDepartments();
  const departments = useDepartments();
  const entries = railFor({ roles, departmentCodes: myDepartments }, departments);
  const here = useRailHere(pathname, entries);

  const section = here.group ? entries.find((entry) => entry.label === here.group) ?? null : null;
  const hereItem =
    section && "items" in section && section.items
      ? section.items.find((item) => item.href === here.href) ?? null
      : null;
  const pageHeader = hereItem?.description
    ? { label: hereItem.label, description: hereItem.description }
    : pageHeaderFor(pathname);
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
    <PageHeaderContext.Provider value={{ setHeaderRightAction, setCustomToggles }}>
      <div
        className="app-shell flex min-h-0 flex-1 flex-col pb-24 md:h-full md:overflow-hidden md:pb-0"
        data-scroll-mode={mode}
      >
        <div className="app-shell-body flex min-h-0 flex-1">
          <NavRail />
          <div className="app-panel-column">
            <AppTopBar />
            <div className="app-content">
              {pageHeader && (
                <div className="shrink-0 bg-white px-3 py-3.5 sm:px-5 border-b border-sand-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h1 className="text-xl font-semibold tracking-tight text-bark sm:text-2xl">{pageHeader.label}</h1>
                    {pageHeader.description && (
                      <p className="mt-0.5 text-xs text-moss sm:text-sm">{pageHeader.description}</p>
                    )}
                  </div>
                  {headerRightAction && (
                    <div className="shrink-0 w-full sm:w-auto flex flex-wrap items-center gap-2">
                      {headerRightAction}
                    </div>
                  )}
                </div>
              )}
              {(customToggles || sectionPages.length > 1) && (
                <div className="shrink-0 border-b border-sand-line bg-white px-3 py-2 sm:px-5 sm:py-2.5">
                  {customToggles ? (
                    customToggles
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
