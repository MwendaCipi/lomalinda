"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { destinationOf, isActive, tabKeys } from "@/config/navigation";
import { useChatUnread } from "@/lib/chat";
import { normalizePath } from "@/lib/paths";
import { atAppFloor, collapseToHome, trackAppHistory } from "@/lib/app-history";
import { useHeaderData } from "@/hooks/use-header-data";

type TabItem = {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
};

/**
 * The phone's tab bar — the places a member moves between all week.
 *
 * Every tab navigates: a section's tab opens the section's first page, and
 * the chip strip on that page carries its siblings (AppFrame). The bar carries
 * Fellowship, the member's ministry map, Stewardship, Materials and Chat —
 * Materials read between the giving page and the rooms, because the study shelf
 * is opened all week the way those two are. The office console has no tab any
 * more (the church's own areas matter more than the office's here); staff reach
 * it from the account menu.
 */
export function MobileTabBar() {
  const pathname = normalizePath(usePathname());
  const router = useRouter();
  const { hasToken } = useHeaderData();
  const isLoggedIn = hasToken;
  // The unread count the chat tab wears. Shared with the top bar's own chat
  // button: one poller feeds both badges.
  const chatUnread = useChatUnread();

  // The bottom tab bar belongs only to the dashboard. Every other surface has
  // its own section strip (AppFrame) for in-section navigation, and the top-bar
  // back arrow returns from any section to the dashboard. Hiding the bar on any
  // non-dashboard route keeps the full screen available for content and avoids
  // the visual clutter of a bar that can never change what section is active
  // once you have left the home screen.
  const isOnDashboard = pathname === "/dashboard";

  // On the dashboard the bar can still step aside while the member scrolls
  // through their announcements — same behaviour as before.
  const navHidesOnScroll = isOnDashboard;
  const [scrolledDown, setScrolledDown] = useState(false);
  const navHidden = !isOnDashboard || (navHidesOnScroll && scrolledDown);

  useEffect(() => {
    if (!navHidesOnScroll) {
      return;
    }
    let lastTarget: EventTarget | null = null;
    let lastY = 0;
    const onScroll = (event: Event) => {
      const element = event.target instanceof HTMLElement ? event.target : null;
      let y = 0;
      if (element && element !== document.documentElement && element !== document.body) {
        y = element.scrollTop;
      } else {
        y = window.scrollY;
      }
      if (event.target !== lastTarget) {
        lastTarget = event.target;
        lastY = y;
        return;
      }
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
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
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

  const items: TabItem[] = tabKeys.flatMap((entry): TabItem[] => {
    // "home" remains in the type for future chrome tabs; the bar carries no
    // Home tab — the topbar's church mark is the way back to the dashboard.
    // "admin" is kept in the type for the same reason: the console has no tab
    // here any more, and its desks are reached from the account menu.
    if (entry === "home" || entry === "admin") return [];
    const dest = destinationOf(entry.key);
    // Every tab navigates: a section's own pages ride the strip on the page
    // it opens (AppFrame), and the console's desks are the cards its overview
    // carries — so the last tab is a link like all the rest.
    return [
      {
        key: entry.key,
        href: dest.href,
        label: dest.tabLabel ?? dest.short ?? dest.label,
        icon: dest.icon,
        active: isActive(dest, pathname),
      },
    ];
  });

  return (
    <nav
      aria-hidden={navHidden}
      // Below every modal (z-50 and up): an overlay the phone opens must
      // float above this bar, not hide its buttons behind it. Page content
      // carries no z of its own, so the bar still sits above the page.
      className={`md:hidden fixed bottom-0 left-0 right-0 z-[45] flex items-center justify-around border-t border-white/15 bg-bark/95 px-1.5 py-1.5 text-white shadow-lg backdrop-blur-md pb-[calc(0.375rem+env(safe-area-inset-bottom))] transition-transform duration-300 ease-out ${
        navHidden ? "translate-y-full pointer-events-none" : "translate-y-0"
      }`}
      aria-label="Main"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`relative flex flex-col items-center justify-center rounded-xl px-1 py-1 text-center min-w-[46px] min-h-[44px] transition-colors ${
              item.active ? "border border-white/30 bg-white/20 font-bold text-white shadow-xs" : "text-white/75 hover:text-white"
            }`}
          >
            <Icon className={`mb-0.5 h-5 w-5 ${item.active ? "text-gold" : "text-white/80"}`} />
            <span className="max-w-[64px] truncate text-[10px] leading-none tracking-tight">{item.label}</span>
            {item.key === "chat" && chatUnread > 0 && (
              <span className="absolute right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[9px] font-bold leading-none text-white">
                {chatUnread > 9 ? "9+" : chatUnread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
