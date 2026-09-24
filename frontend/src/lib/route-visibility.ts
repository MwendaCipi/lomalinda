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
