"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Download, LogOut } from "lucide-react";

import {
  activeDestination,
  branchOf,
  destinationOf,
  isStaffRole,
  railBranches,
  railTopKeys,
} from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { setRailCarriesNav } from "@/lib/rail-nav";
import { resetHeaderSession, useHeaderData } from "@/hooks/use-header-data";
import { clearSession } from "@/lib/auth";
import { triggerPwaInstall } from "./pwa-register";

/**
 * The navigation rail — the app's navigation, in one column.
 *
 * The top bar keeps identity (brand, bell, avatar); the rail carries the
 * places, grouped into branches. Each branch row navigates to its landing
 * page while the caret beside it opens the branch in place, so nothing that
 * used to be one tap becomes two.
 *
 * Three rules keep an accordion rail from hiding where you are:
 *
 * - the active branch opens itself whenever you arrive on one of its pages,
 * - only one branch is open at a time (the rail scrolls instead of growing),
 * - the open branch is scrolled into view, and the rail scrolls on its own
 *   rather than moving the page.
 *
 * The rail announces itself to the top bar (see lib/rail-nav), which drops
 * the church-wide links while the rail carries them.
 */
export function NavRail() {
  const pathname = normalizePath(usePathname());
  const router = useRouter();
  const { me } = useHeaderData();
  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  const isStaff = isStaffRole(roles);

  const branches = railBranches.filter((branch) => !branch.staffOnly || isStaff);
  /** The one destination we are on — never two rows highlighted at once. */
  const here = activeDestination(pathname);
  const activeBranchLabel = branchOf(pathname, branches)?.label ?? null;

  /**
   * The branch the member has opened or closed by hand, and the branch they
   * were looking at when they did it. Kept as an override rather than synced
   * from the pathname in an effect: arriving on a page derives the open branch
   * during render, so the rail never paints the previous page's branch.
   */
  const [toggled, setToggled] = useState<{ from: string | null; open: string | null } | null>(null);
  const openLabel = toggled && toggled.from === activeBranchLabel ? toggled.open : activeBranchLabel;

  const branchRefs = useRef<Record<string, HTMLElement | null>>({});

  // The rail is the navigation only where it is actually drawn (`lg`). Between
  // the tab bar's breakpoint and `lg` the rail is hidden, so the top bar keeps
  // its links; the rail tells it when to stand down, and stands it back up on
  // unmount so leaving the workspace restores the church's map.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const apply = () => setRailCarriesNav(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => {
      query.removeEventListener("change", apply);
      setRailCarriesNav(false);
    };
  }, []);

  // The open branch is scrolled into view, so the rail shows where you are
  // without the member hunting for it. DOM only — no state to settle.
  useEffect(() => {
    if (!activeBranchLabel) return;
    branchRefs.current[activeBranchLabel]?.scrollIntoView({ block: "nearest" });
  }, [activeBranchLabel]);

  const toggle = (label: string) => {
    setToggled((current) => {
      const open = current && current.from === activeBranchLabel ? current.open : activeBranchLabel;
      return { from: activeBranchLabel, open: open === label ? null : label };
    });
  };

  const topItems = railTopKeys.map(destinationOf);

  return (
    <aside className="hidden h-full min-h-0 w-64 shrink-0 border-r border-sand-line bg-sand-grain lg:flex lg:flex-col">
      <div className="flex h-full min-h-0 flex-1 flex-col justify-between overflow-y-auto custom-hover-scrollbar">
        <div className="p-4">
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-moss">
            Navigate
          </p>

          {/* Standalone rows: a place with nothing under it. */}
          <nav className="space-y-1">
            {topItems.map((dest) => {
              const Icon = dest.icon;
              const active = here?.href === dest.href;
              return (
                <Link
                  key={dest.href}
                  href={dest.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    active ? "bg-bark text-white shadow-sm" : "text-bark hover:bg-sand"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{dest.short ?? dest.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Branches: the row navigates, the caret expands its pages. */}
          <div className="mt-3 space-y-1 border-t border-sand-line pt-3">
            {branches.map((branch) => {
              const open = openLabel === branch.label;
              const landing = destinationOf(branch.keys[0]);
              const BranchIcon = branch.icon;
              const branchActive = branch.keys.some(
                (key) => destinationOf(key).href === here?.href
              );
              // The branch's first key is the row's own destination, so the
              // list below it starts at the second — the row is never repeated
              // as its own child.
              const children = branch.keys.slice(1).map(destinationOf);
              return (
                <div
                  key={branch.label}
                  ref={(node) => {
                    branchRefs.current[branch.label] = node;
                  }}
                >
                  <div
                    className={`flex items-center rounded-xl transition ${
                      branchActive ? "bg-bark text-white shadow-sm" : "text-bark hover:bg-sand"
                    }`}
                  >
                    <Link
                      href={landing.href}
                      aria-current={branchActive ? "page" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold"
                    >
                      <BranchIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{branch.label}</span>
                    </Link>
                    {children.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggle(branch.label)}
                        aria-expanded={open}
                        aria-label={`${open ? "Hide" : "Show"} ${branch.label} pages`}
                        className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition hover:bg-black/5"
                      >
                        <ChevronRight
                          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
                        />
                      </button>
                    )}
                  </div>

                  {open && children.length > 0 && (
                    <ul className="mt-1 mb-1 space-y-0.5 pl-3">
                      {children.map((child) => {
                        const childActive = here?.href === child.href;
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              aria-current={childActive ? "page" : undefined}
                              className={`flex items-center gap-2 rounded-lg border-l-2 py-1.5 pl-3 pr-2 text-xs font-medium transition ${
                                childActive
                                  ? "border-ember bg-white text-bark font-semibold"
                                  : "border-sand-line text-moss hover:border-ember hover:text-bark"
                              }`}
                            >
                              <span className="truncate">{child.short ?? child.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* The foot: the two things a rail carries naturally. */}
        <div className="space-y-2 border-t border-sand-line p-4">
          <button
            type="button"
            onClick={triggerPwaInstall}
            className="flex w-full items-center justify-between rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-xs font-semibold text-bark shadow-xs transition hover:bg-sand"
          >
            <span className="flex items-center gap-2">
              <Download className="h-4 w-4 text-ember" />
              Install App
            </span>
            <span className="text-[10px] font-bold text-ember">PWA</span>
          </button>
          <button
            type="button"
            onClick={() => {
              // Privacy on shared devices: signing out closes the giving record
              // and the cached header with it, so the next person inherits
              // neither the previous member's record nor their name.
              clearSession();
              resetHeaderSession();
              router.push("/login");
              router.refresh();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-moss transition hover:bg-sand hover:text-bark"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
