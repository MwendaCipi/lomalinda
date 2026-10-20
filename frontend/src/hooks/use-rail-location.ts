"use client";

import { useEffect, useReducer } from "react";

import { onAppLocationChange } from "@/lib/app-history";
import { railHere, type RailEntry, type RailHere, type RailQuery } from "@/config/navigation";

/** The console's `?tab=` and `?dept=`, as the address bar holds them now. */
function readRailQuery(): RailQuery {
  // Prerendered pages are built without a location; the shell draws no chrome
  // until the token is known, so this empty answer never reaches a screen.
  if (typeof window === "undefined") return { tab: null, dept: null };
  const params = new URLSearchParams(window.location.search);
  return { tab: params.get("tab"), dept: params.get("dept") };
}

/**
 * The console's `?tab=` and `?dept=`, read from the address bar.
 *
 * Read directly rather than through `useSearchParams`, because the rail, the
 * phone's menu and the shell that draws the section strip are all rendered on
 * pages that are prerendered — reading the location in an effect keeps those
 * pages static. Next's client navigation writes the URL through the history API
 * without firing `popstate`, so the readers also subscribe to the app's own
 * location notifications (see `app-history`); clicking another console page
 * updates the highlight in the same breath as the page.
 *
 * The query is read **while rendering**, not copied into state first: a copy
 * settles a render late, and in that render the page has already changed while
 * the chrome still names the desk that was left — the strip showing the old
 * section's pages over the new page's loading state. The subscription below
 * only asks for another render when the address bar moves, so the answer is
 * always the current one.
 */
export function useRailQuery(): RailQuery {
  const [, reread] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    const read = () => reread();
    const unsubscribe = onAppLocationChange(read);
    window.addEventListener("popstate", read);
    return () => {
      unsubscribe();
      window.removeEventListener("popstate", read);
    };
  }, []);

  return readRailQuery();
}

/** Which row of `entries` the current location is on, and which page of it. */
export function useRailHere(pathname: string, entries: RailEntry[]): RailHere {
  const query = useRailQuery();
  return railHere(pathname, query, entries);
}
