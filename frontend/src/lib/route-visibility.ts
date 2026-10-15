// Sections of the app that are part of the members/church system and require sign-in.
// Everything else (marketing, info, reading material, and open-participation pages) is public and indexable.
const SYSTEM_SECTIONS = new Set([
  "administration",
  "member",
  "support",
  "financial",
  "community",
  "announcements",
  "fellowship",
  "services",
]);

export function isSystemRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const first = pathname.split("/").filter(Boolean)[0];
  return !!first && SYSTEM_SECTIONS.has(first);
}

/**
 * The sign-in surfaces — pages a signed-in member has no business on, so the
 * marketing header stays for them there too.
 */
const SIGN_IN_SURFACES = ["/login", "/create-account", "/forgot-password", "/reset-password", "/accept-invite"];

/**
 * The marketing website: the church's own pages, read the same way whether or
 * not the reader is signed in. A signed-in member on one of these keeps the
 * marketing header and gets no rail — it is the public site, not their desk.
 *
 * The complement of this list is the app: every other public-group page a
 * member reaches from the rail or the tab bar (Materials, Calendar, Requests,
 * Share) keeps the app chrome, so navigation never changes shape under them.
 *
 * `/give` is the public Support Us page; the member Giving desk lives at
 * `/member/giving`, which is why the two sides no longer share one URL.
 */
const MARKETING_PAGES = [
  "/beliefs",
  "/about",
  "/privacy",
  "/terms",
  "/ministries",
  "/give",
  "/campaigns",
  "/drives",
  "/fund-drives",
];

export function isMarketingPage(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  // trailingSlash is on, so the hook answers "/about/" where the route is
  // "/about" — compare the trimmed form the app works in.
  const path = pathname.replace(/\/+$/, "") || "/";
  const named = (list: string[]) => list.some((page) => path === page || path.startsWith(`${page}/`));
  return path === "/" || named(SIGN_IN_SURFACES) || named(MARKETING_PAGES);
}
