/**
 * The current route in the form the app compares it in.
 *
 * The build sets `trailingSlash`, so `usePathname()` answers "/about/" where
 * the route is "/about". An equality test against the bare path therefore never
 * matched — every sidebar lost its active row, and a page that wanted to react
 * to one exact path silently did nothing. Components normalise once, where they
 * read the hook, so no caller has to remember.
 */
export function normalizePath(path: string | null | undefined): string {
  const trimmed = (path ?? "").replace(/\/+$/, "");
  return trimmed || "/";
}
