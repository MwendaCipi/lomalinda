"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, X, type LucideIcon } from "lucide-react";

import { destinationOf, isActive, isStaffRole, tabKeys } from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { atAppFloor, collapseToHome, trackAppHistory } from "@/lib/app-history";
import { useHeaderData } from "@/hooks/use-header-data";

type TabItem = {
  key: string;
  href?: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  replace?: boolean;
  collapseHistory?: boolean;
};

/**
 * The phone's tab bar — the four places a member moves between all week, and
 * the whole map behind the last tab.
 *
 * The rail is not squeezed into a drawer on a phone: the same entries open as
 * cards (MobileMenu), because a column written for a desktop is a poor thing
 * to read on a phone. That last tab is the leaders' door — it wears the
 * office's name and only the church's offices are offered it, so the map is
 * theirs and the tab bar a member does not serve is four places, not five.
 */
export function MobileTabBar({ menuOpen, onToggleMenu }: { menuOpen: boolean; onToggleMenu: () => void }) {
  const pathname = normalizePath(usePathname());
  const router = useRouter();
  const { me, hasToken } = useHeaderData();
  const isLoggedIn = hasToken;
  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  /** The last tab is the leaders' — the same offices the console admits. */
  const isStaff = isStaffRole(roles);

  // On the surfaces that are read by scrolling — the dashboard, the
  // announcements feed and the live reports board — the bar steps out of the
  // way on the way down and comes straight back on any upward movement, so a
  // long read gets the whole screen without stranding anyone.
  const navHidesOnScroll =
    pathname === "/dashboard" || pathname.startsWith("/announcements") || pathname === "/support/reports";
  const [scrolledDown, setScrolledDown] = useState(false);
  // The route decides whether hiding is in play at all; the scroll only ever
  // says which way the reader is going. Deriving the bar's state keeps a route
  // change from needing to reset anything.
  const navHidden = navHidesOnScroll && scrolledDown;

  useEffect(() => {
    if (!navHidesOnScroll) return;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const moved = y - lastY;
      lastY = y;
      // Near the top the bar is always shown, whatever the last movement was.
      if (y <= 64) {
        setScrolledDown(false);
        return;
      }
      // A few pixels of jitter is not a scroll: without this the bar flickers.
      if (Math.abs(moved) < 8) return;
      setScrolledDown(moved > 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [navHidesOnScroll]);

  // Count this tab's app entries from the first render, so "go home" knows how
  // far back the floor is. Records history; it never navigates on its own.
  useEffect(() => {
    trackAppHistory();
  }, []);

  /**
   * The dashboard is the app's front door, so it is also the floor of the back
   * stack: arriving there — by any door, not just the Home tab — drops
   * everything stacked above it, and the next Back leaves the app instead of
   * replaying the sign-in form and the pages that led in.
   *
   * A browser keeps its back button, so this is the phone's rule, and the
   * installed app's at any width. At the floor already, there is nothing to
   * drop and nothing to rewrite.
   */
  useEffect(() => {
    if (pathname !== "/dashboard" || !isLoggedIn || atAppFloor()) return;
    const appSurface =
      window.matchMedia("(max-width: 767px)").matches ||
      window.matchMedia("(display-mode: standalone)").matches;
    if (!appSurface) return;
    collapseToHome(() => router.replace("/dashboard"));
  }, [pathname, isLoggedIn, router]);

  /**
   * Go home, dropping everything stacked above it: in the app Home is the
   * dashboard and the floor of the stack, so the next Back leaves the app.
   */
  const goHome = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isLoggedIn) return;
    event.preventDefault();
    collapseToHome(() => router.replace("/dashboard"));
  };

  const items: TabItem[] = tabKeys.flatMap((entry): TabItem[] => {
    if (entry === "home") {
      return [
        {
          key: "home",
          href: isLoggedIn ? "/dashboard" : "/",
          label: "Home",
          icon: Home,
          active: pathname === "/" || pathname.startsWith("/dashboard"),
          replace: true,
          collapseHistory: true,
        },
      ];
    }
    if (entry === "admin") {
      // The leaders' door: the rail's entries opened as cards, under the
      // office's own name and mark. Tapping again puts the cards away — the
      // icon says so. A member who serves in no office gets no last tab.
      if (!isStaff) return [];
      const admin = destinationOf("administration");
      return [
        {
          key: "admin",
          label: admin.short ?? admin.label,
          icon: menuOpen ? X : admin.icon,
          active: menuOpen || pathname.startsWith("/administration"),
        },
      ];
    }
    const dest = destinationOf(entry.key);
    return [
      {
        key: entry.key,
        href: dest.href,
        label: dest.short ?? dest.label,
        icon: dest.icon,
        active: isActive(dest, pathname),
      },
    ];
  });

  return (
    /* The bar sits above the menu sheet (z-50) — the last tab both opens and
       closes it. */
    <nav
      aria-hidden={navHidden && !menuOpen}
      className={`md:hidden fixed bottom-0 left-0 right-0 z-[60] flex items-center justify-around border-t border-white/15 bg-bark/95 px-1.5 py-1.5 text-white shadow-lg backdrop-blur-md pb-[calc(0.375rem+env(safe-area-inset-bottom))] transition-transform duration-300 ease-out ${
        navHidden && !menuOpen ? "translate-y-full pointer-events-none" : "translate-y-0"
      }`}
      aria-label="Main"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const className = `relative flex flex-col items-center justify-center rounded-xl px-1 py-1 text-center min-w-[46px] min-h-[44px] transition-colors ${
          item.active ? "border border-white/30 bg-white/20 font-bold text-white shadow-xs" : "text-white/75 hover:text-white"
        }`;

        if (item.key === "admin") {
          return (
            <button
              key="admin"
              type="button"
              onClick={onToggleMenu}
              className={className}
              aria-expanded={menuOpen}
            >
              <Icon className={`mb-0.5 h-5 w-5 ${item.active ? "text-gold" : "text-white/80"}`} />
              <span className="text-[10px] leading-none tracking-tight">{item.label}</span>
            </button>
          );
        }

        return (
          <Link
            key={item.key}
            href={item.href!}
            replace={item.replace}
            onClick={item.collapseHistory ? goHome : undefined}
            className={className}
          >
            <Icon className={`mb-0.5 h-5 w-5 ${item.active ? "text-gold" : "text-white/80"}`} />
            <span className="max-w-[52px] truncate text-[10px] leading-none tracking-tight">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
