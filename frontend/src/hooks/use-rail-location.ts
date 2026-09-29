"use client";

import { useEffect, useState } from "react";

import { onAppLocationChange } from "@/lib/app-history";
import { railHere, type RailEntry, type RailHere, type RailQuery } from "@/config/navigation";

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
 */
export function useRailQuery(): RailQuery {
  const [query, setQuery] = useState<RailQuery>({ tab: null, dept: null });

  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      setQuery({ tab: params.get("tab"), dept: params.get("dept") });
    };
    read();
    const unsubscribe = onAppLocationChange(read);
    window.addEventListener("popstate", read);
    return () => {
      unsubscribe();
      window.removeEventListener("popstate", read);
    };
  }, []);

  return query;
}

/** Which row of `entries` the current location is on, and which page of it. */
export function useRailHere(pathname: string, entries: RailEntry[]): RailHere {
  const query = useRailQuery();
  return railHere(pathname, query, entries);
}
