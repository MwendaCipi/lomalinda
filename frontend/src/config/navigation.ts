import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  Gift,
  HandHeart,
  Heart,
  HeartHandshake,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Users,
  FileText,
} from "lucide-react";

/**
 * The navigation model — one registry of destinations, each with one canonical
 * href and one canonical label, so no surface can rename a place or invent a
 * second path to it.
 *
 * Every navigation surface renders from here:
 *
 * - the desktop bar (`SiteNav`) picks `barKeys`,
 * - the mobile tab bar picks `tabKeys` (Home is chrome, not a destination),
 * - the signed-in user menu picks `accountMenuKeys`,
 * - the member workspace rail picks `railBranches` / `railTopKeys`,
 * - the dashboard's quick tiles pick `dashboardTiles` (audiences applied),
 * - the marketing footer's columns pick `footerColumns`,
 * - the Fellowship hub's cards pick `fellowshipHubKeys`.
 *
 * A destination may appear on several surfaces, but it is *described* in
 * exactly one place: label, href, icon and active-matchers live here. Renaming
 * something edits one line and the bar, tab, tile, menu and footer change
 * together; a new page becomes linkable everywhere by adding one entry.
 *
 * Surfaces may shorten a label for tight chrome (`short`) or name a *task*
 * on a tile (`Treasury` opening the accounts tab of Administration) — but
 * they may not vary the destination itself.
 */

/** Every role that reaches the office console. */
export const STAFF_ROLES: readonly string[] = [
  "admin",
  "clerk",
  "elder",
  "youth_leader",
  "choir_director",
  "children_ministry",
  "men_ministry",
  "women_ministry",
  "chaplaincy",
  "treasurer",
];

export type NavDestination = {
  /** Canonical href — the only path for this destination, everywhere. */
  href: string;
  /** Canonical label — the one name this place goes by. */
  label: string;
  /** Optional shorter label for surfaces with very little room (tab bar). */
  short?: string;
  /** One-line description for surfaces that show one (tiles, hub cards). */
  description?: string;
  icon: LucideIcon;
  /** Where the destination belongs in the app's mental model. */
  area: "fellowship" | "study" | "stewardship" | "about" | "account" | "office";
  /** Roles that may see the destination; absent means everyone. */
  audience?: readonly string[];
  /**
   * Which path prefixes count as "here" for active styling. Absent means the
   * destination's own href (plus a trailing segment).
   */
  match?: readonly string[];
};

/**
 * The registry. Order inside an area is the display order wherever a surface
 * lists that area's destinations.
 */
export const destinations = {
  dashboard: {
    href: "/dashboard",
    label: "Dashboard",
    description: "The week's news, your places and your giving, in one place.",
    icon: LayoutDashboard,
    area: "account",
    match: ["/dashboard"],
  },
  fellowship: {
    href: "/fellowship",
    label: "Fellowship",
    description: "Where the church family gathers — news, services, testimony and care.",
    icon: Megaphone,
    area: "fellowship",
    match: ["/fellowship", "/share", "/spiritual", "/announcements", "/services", "/community", "/enroll"],
  },
  announcements: {
    href: "/announcements",
    label: "Announcements",
    description: "Notices and updates shared with the church family.",
    icon: Megaphone,
    area: "fellowship",
    match: ["/announcements"],
  },
  services: {
    href: "/services",
    label: "Live Services",
    description: "Join worship online, or catch up on a service you missed.",
    icon: Gift,
    area: "fellowship",
    match: ["/services"],
  },
  testimonies: {
    href: "/spiritual/testimonies",
    label: "Testimonies",
    description: "Read and share how God is at work among us.",
    icon: Sparkles,
    area: "fellowship",
    match: ["/spiritual"],
  },
  prayerVisitation: {
    href: "/community/prayer-visitation",
    label: "Prayer & Visitation Requests",
    short: "Prayer & Care",
    description: "Request prayer or a pastoral visit — one desk for both.",
    icon: Heart,
    area: "fellowship",
    match: ["/community"],
  },
  childDedication: {
    href: "/community/child-dedication",
    label: "Child Dedication",
    description: "Begin a conversation about dedicating your child during worship.",
    icon: ClipboardList,
    area: "fellowship",
    match: ["/community"],
  },
  membership: {
    href: "/enroll",
    label: "Membership",
    description: "Join through baptism or transfer, or request a transfer out.",
    icon: Users,
    area: "fellowship",
    match: ["/enroll"],
  },
  ideas: {
    href: "/support/ideas",
    label: "Ideas & Suggestions",
    description: "Offer an idea that could help the church.",
    icon: Lightbulb,
    area: "fellowship",
    match: ["/support/ideas"],
  },
  calendar: {
    href: "/calendar",
    label: "Church Calendar",
    short: "Calendar",
    description: "Sabbaths, vespers, programmes and upcoming events.",
    icon: Calendar,
    area: "fellowship",
    match: ["/calendar"],
  },
  materials: {
    href: "/materials",
    label: "Materials",
    short: "Materials",
    description: "Sabbath School lessons, hymnals, Bible and EGW readings.",
    icon: BookOpen,
    area: "study",
    match: ["/materials"],
  },
  give: {
    href: "/give",
    label: "Giving",
    description: "Give tithes and offerings by M-Pesa or bank transfer.",
    icon: HandHeart,
    area: "stewardship",
    // The whole Stewardship & Support section reads as "Giving" on the bars —
    // except Ideas & Suggestions, which belongs to Fellowship.
    match: ["/give", "/support/campaigns", "/support/in-kind", "/support/budget", "/support/reports", "/support/periodical-reports", "/support/financial"],
  },
  fundDrives: {
    href: "/support/campaigns",
    label: "Fund Drives",
    description: "Active fund drives and how far along they are.",
    icon: Target,
    area: "stewardship",
    match: ["/support/campaigns"],
  },
  inKind: {
    href: "/support/in-kind",
    label: "In-Kind Giving",
    description: "Offer goods, equipment, services or time instead of money.",
    icon: Gift,
    area: "stewardship",
    match: ["/support/in-kind"],
  },
  budget: {
    href: "/support/budget",
    label: "Church Budget",
    description: "Published annual budgets and how departments plan to use them.",
    icon: BarChart3,
    area: "stewardship",
    match: ["/support/budget"],
  },
  liveReports: {
    href: "/support/reports",
    label: "Live Reports",
    description: "Real-time, transparent tracking of contributions by category.",
    icon: TrendingUp,
    area: "stewardship",
    match: ["/support/reports"],
  },
  periodicalReports: {
    href: "/support/periodical-reports",
    label: "Periodic Reports",
    description: "Weekly, monthly, quarterly and annual published statements.",
    icon: FileText,
    area: "stewardship",
    match: ["/support/periodical-reports"],
  },
  about: {
    href: "/about",
    label: "About",
    description: "Our story, mission, vision and the values that guide us.",
    icon: Building2,
    area: "about",
    match: ["/about"],
  },
  myAccount: {
    href: "/member",
    label: "My Account & Giving",
    short: "My Account",
    description: "Your details and your giving history.",
    icon: Users,
    area: "account",
    // `/member/reports` is its own destination below, so it is excluded here.
    match: ["/member"],
  },
  memberReports: {
    href: "/member/reports",
    label: "Giving Statements",
    description: "The statements of giving and church finances we publish.",
    icon: BarChart3,
    area: "account",
    match: ["/member/reports"],
  },
  welfare: {
    href: "/community/welfare",
    label: "Member Welfare",
    description: "Welfare support for a member who needs a hand.",
    icon: HeartHandshake,
    area: "fellowship",
    match: ["/community/welfare"],
  },
  administration: {
    href: "/administration",
    label: "Administration",
    short: "Admin",
    description: "The office console — members, departments, meetings, treasury.",
    icon: ShieldCheck,
    area: "office",
    audience: STAFF_ROLES,
    match: ["/administration"],
  },
} satisfies Record<string, NavDestination>;

export type DestinationKey = keyof typeof destinations;
export type Destination = NavDestination;

export function destinationOf(key: DestinationKey): Destination {
  return destinations[key];
}

/** Is this destination visible to the given roles? */
export function isVisible(dest: Destination, roles: readonly string[]): boolean {
  if (!dest.audience) return true;
  return roles.some((role) => dest.audience!.includes(role));
}

/** Does this pathname land on the destination? (One active-state rule, everywhere.) */
export function isActive(dest: Destination, pathname: string): boolean {
  const patterns = dest.match ?? [dest.href];
  return patterns.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * The one destination a pathname is on — the most specific match wins.
 *
 * Destinations deliberately overlap: `/member` matches the statements page
 * under it, and the Fellowship hub matches the whole `/community` tree where
 * welfare and child dedication also live. Asking each destination in turn
 * therefore lights up two rows at once. Comparing how many characters each
 * matched, and keeping the longest, leaves exactly one row highlighted — the
 * rule every surface that draws active state should use.
 */
export function activeDestination(pathname: string): Destination | null {
  let best: Destination | null = null;
  let bestLength = -1;
  for (const dest of Object.values(destinations) as Destination[]) {
    const patterns = dest.match ?? [dest.href];
    const length = patterns.reduce(
      (longest, prefix) =>
        pathname === prefix || pathname.startsWith(`${prefix}/`)
          ? Math.max(longest, prefix.length)
          : longest,
      -1
    );
    if (length > bestLength) {
      best = dest;
      bestLength = length;
    }
  }
  return best;
}

/** Does any of these roles reach the office console? */
export function isStaffRole(roles: readonly string[]): boolean {
  return roles.some((role) => STAFF_ROLES.includes(role));
}

// ── Surface layouts ─────────────────────────────────────────────────────────

/**
 * The desktop bar. The Fellowship entry opens the section's hub — the same
 * place the same label opens on a phone, which is the whole point.
 */
export const barKeys: { key: DestinationKey; staffOnly?: boolean }[] = [
  { key: "fellowship" },
  { key: "materials" },
  { key: "give" },
  { key: "about" },
  { key: "administration", staffOnly: true },
];

/**
 * The phone's tab bar, in the order a member moves through the app. "home"
 * is the dashboard-or-site-home tab; it is chrome (dynamic destination,
 * history collapse), not a destination, so SiteNav renders it specially.
 * The office reaches its console from the tab bar; a member's account tab
 * takes that slot.
 */
export const tabKeys: ({ key: DestinationKey; staffOnly?: boolean; memberOnly?: boolean } | "home")[] = [
  "home",
  { key: "fellowship" },
  { key: "materials" },
  { key: "give" },
  // The rail hides at this width, so a member's own places — account,
  // statements, welfare, care — would otherwise live only in the avatar
  // menu. Staff trade this slot for their console tab.
  { key: "myAccount", memberOnly: true },
  { key: "administration", staffOnly: true },
];

/**
 * The signed-in user menu. Deliberately short: the top bar shows the
 * church's places (Fellowship, Materials, Giving, About) and the rail shows
 * the workspace's, so this menu holds only what neither carries — the
 * member's own account, the calendar, and the office console.
 */
export const accountMenuKeys: { key: DestinationKey; staffOnly?: boolean }[] = [
  { key: "myAccount" },
  { key: "calendar" },
  { key: "administration", staffOnly: true },
];

/**
 * The rail's branches — navigation lives in the sidebar and each branch
 * expands in place to show its own pages.
 *
 * The keys name destinations in the registry above: a branch cannot rename
 * a place or invent an href. The first key is the branch's landing page, so
 * a branch row navigates there and the caret beside it opens the children.
 */
export type NavBranch = {
  label: string;
  icon: LucideIcon;
  keys: DestinationKey[];
  staffOnly?: boolean;
};

export const railBranches: NavBranch[] = [
  { label: "My Church", icon: User, keys: ["myAccount", "memberReports", "welfare", "prayerVisitation"] },
  {
    label: "Fellowship",
    icon: Megaphone,
    keys: ["fellowship", "announcements", "services", "testimonies", "childDedication", "membership", "ideas", "calendar"],
  },
  { label: "Materials", icon: BookOpen, keys: ["materials"] },
  { label: "Giving", icon: HandHeart, keys: ["give", "fundDrives", "inKind", "budget", "liveReports", "periodicalReports"] },
  { label: "About", icon: Building2, keys: ["about"] },
  { label: "Office", icon: ShieldCheck, keys: ["administration"], staffOnly: true },
];

/** The rail's standalone rows above the branches — nothing to expand. */
export const railTopKeys: DestinationKey[] = ["dashboard"];

/**
 * The branch a pathname falls in, or null when it is a standalone row.
 *
 * Branches are passed in because the rail renders a filtered list (staff see
 * the Office branch, members do not), and the active row must be looked for
 * among the rows that exist.
 */
export function branchOf(pathname: string, branches: NavBranch[] = railBranches): NavBranch | null {
  const here = activeDestination(pathname);
  if (!here) return null;
  return (
    branches.find((branch) =>
      branch.keys.some((key) => destinationOf(key).href === here.href)
    ) ?? null
  );
}

/**
 * The dashboard's quick tiles. `audience` narrows a tile to the offices that
 * use it; `task` names the work that office does on the console (the tile may
 * say "Treasury" while opening Administration's accounts tab); `tab` appends
 * the query that opens that tab — surfaces never invent these hrefs.
 */
export type TileSpec = {
  key: DestinationKey;
  audience?: readonly string[];
  task?: string;
  description?: string;
  tab?: string;
};

/** The Requests tile: the desk for leadership, the forms for everyone else. */
export const REQUESTS_TILE = {
  label: "Requests",
  deskDescription: "Join, prayer, visitation, dedication",
  memberDescription: "Prayer, visitation, dedication",
  deskHref: "/administration?tab=requests",
  memberHref: "/requests",
  /** The desks that answer requests — same list the Requests managers gate by. */
  deskAudience: ["elder", "admin", "clerk", "pastor", "chaplaincy", "welfare_leader", "children_ministry"],
};

export const dashboardTiles: TileSpec[] = [
  { key: "announcements" },
  { key: "give" },
  { key: "calendar" },
  { key: "materials" },
  { key: "myAccount" },
  {
    key: "administration",
    audience: ["treasurer", "admin"],
    task: "Treasury",
    description: "Accounts, receipts, refunds",
    tab: "accounts",
  },
  {
    key: "administration",
    audience: ["elder", "admin", "clerk"],
    task: "Members",
    description: "Directory, roles, invites",
    tab: "users",
  },
  {
    key: "administration",
    audience: ["elder", "admin"],
    task: "Board Meetings",
    description: "Agendas and minutes",
    tab: "board",
  },
  {
    key: "administration",
    audience: ["elder", "admin"],
    task: "Church Settings",
    description: "Configuration",
    tab: "settings",
  },
];

/**
 * The marketing footer's columns. A link either names a destination `key`
 * (label and href come from the registry) or is a raw `href`/`label` pair for
 * page anchors and legal pages that are not destinations.
 */
export type FooterLink = { key: DestinationKey } | { href: string; label: string };

export const footerColumns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Worship",
    links: [
      { key: "calendar" },
      { key: "materials" },
      { key: "announcements" },
      { key: "prayerVisitation" },
    ],
  },
  {
    heading: "Giving",
    links: [{ key: "give" }, { key: "fundDrives" }, { key: "inKind" }],
  },
  {
    heading: "Church",
    links: [
      { href: "#beliefs", label: "What we believe" },
      { href: "#contact", label: "Contact & directions" },
      { key: "about" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Use" },
    ],
  },
];

/** Resolve a footer link to its href/label pair. */
export function footerLinkOf(link: FooterLink): { href: string; label: string } {
  if ("key" in link) {
    const dest = destinations[link.key];
    return { href: dest.href, label: dest.label };
  }
  return { href: link.href, label: link.label };
}

/** The Fellowship hub's cards — the section's front door, on every screen size. */
export const fellowshipHubKeys: DestinationKey[] = [
  "announcements",
  "services",
  "prayerVisitation",
  "testimonies",
  "childDedication",
  "membership",
  "ideas",
  "calendar",
];
