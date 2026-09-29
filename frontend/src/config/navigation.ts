import type { LucideIcon } from "lucide-react";
import {
  Armchair,
  BarChart3,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  Calendar,
  ClipboardList,
  Crown,
  Gift,
  HandHeart,
  Heart,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  Receipt,
  Scale,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Undo2,
  User,
  UserCheck,
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
 * - the rail (`NavRail`) picks `railEntries`,
 * - the phone's tab bar picks `tabKeys` (Home and Menu are chrome),
 * - the account menu picks `accountMenuKeys`,
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

/** Does any of these roles reach the office console? */
export function isStaffRole(roles: readonly string[]): boolean {
  return roles.some((role) => STAFF_ROLES.includes(role));
}

// ── The rail ────────────────────────────────────────────────────────────────

/**
 * The rail is the app's navigation: one column, everywhere, at every width.
 *
 * A row either *is* a page (it navigates) or *holds* pages (it expands, and
 * the pages inside it navigate). Nothing else — no second sidebar appears
 * when a section opens, and no page draws navigation of its own.
 */

/** One page in the rail. */
export type RailItem = {
  href: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  /** Path prefixes that count as "here"; registry items carry their own. */
  match?: readonly string[];
  /** For pages that are a `?tab=` of one route, the value that page is. */
  tab?: string;
  /** Roles that may see it; absent means everyone. */
  roles?: readonly string[];
  /** Roles that hide it even where `roles` matches (the admin's rule). */
  hiddenFor?: readonly string[];
};

/** A row: a page (`href`), or a group of pages (`items`) that expands. */
export type RailEntry = {
  label: string;
  icon: LucideIcon;
  href?: string;
  match?: readonly string[];
  items?: RailItem[];
  roles?: readonly string[];
  hiddenFor?: readonly string[];
};

/** A rail page, described by the registry where the registry has it. */
function page(key: DestinationKey, extra: Partial<RailItem> = {}): RailItem {
  const dest: NavDestination = destinations[key];
  return {
    href: dest.href,
    label: dest.label,
    short: dest.short,
    icon: dest.icon,
    match: dest.match,
    ...extra,
  };
}

/** A page that is a tab of the office console rather than a route of its own. */
function officeTab(tab: string, label: string, icon: LucideIcon, extra: Partial<RailItem> = {}): RailItem {
  return { href: `/administration?tab=${tab}`, tab, label, icon, ...extra };
}

const DEACONATE_ROLES = ["deacon", "deaconess", "head_deacon", "head_deaconess", "admin"];
const REQUESTS_DESK_ROLES = ["elder", "clerk", "admin", "pastor", "chaplaincy", "children_ministry", "welfare_leader"];

/**
 * The office's pages, in the rail's own vocabulary.
 *
 * These are the sections the admin console has always had, gated by the same
 * roles its sidebar used: the elders' desk for the office, the treasury for
 * the treasurer, the deaconate for the deacons, and each department's own
 * desk for its leader. An admin sees the desks in the office rather than the
 * department copies of them — an officer reaches a department through
 * Departments & Ministries.
 */
export const officeItems: RailItem[] = [
  officeTab("leaders", "Departments & Ministries", Crown, { roles: ["elder", "clerk", "admin"] }),
  officeTab("users", "User Management", Users, { roles: ["elder", "clerk", "admin"] }),
  officeTab("board", "Board Meetings", Armchair, { roles: ["elder", "admin"] }),
  officeTab("business", "Business Meetings", Briefcase, { roles: ["elder", "clerk", "admin"] }),
  officeTab("announcements", "Announcements", Megaphone, { roles: ["elder", "clerk", "admin"] }),
  officeTab("requests", "Requests", HeartHandshake, { roles: REQUESTS_DESK_ROLES }),
  officeTab("settings", "Church Settings", Settings, { roles: ["elder", "clerk", "admin"] }),
  officeTab("accounts", "Treasury Accounts", Landmark, { roles: ["treasurer", "admin"] }),
  {
    href: "/administration/fund-drives",
    label: "Fund Drives",
    icon: Target,
    match: ["/administration/fund-drives"],
    roles: ["treasurer", "admin"],
  },
  officeTab("expenditures", "Expenditure", Receipt, { roles: ["treasurer", "admin"] }),
  {
    href: "/administration/reconciliation",
    label: "Contributions Ledger",
    icon: Scale,
    match: ["/administration/reconciliation"],
    roles: ["treasurer", "admin"],
  },
  officeTab("refunds", "M-Pesa Refunds", Undo2, { roles: ["treasurer", "admin"] }),
  officeTab("inventory", "Inventory", Boxes, { roles: DEACONATE_ROLES }),
  officeTab("deaconate-rota", "Duty Rota", ClipboardList, { roles: DEACONATE_ROLES }),
  officeTab("deaconate-members", "Deaconate Team", UserCheck, { roles: DEACONATE_ROLES }),
  officeTab("deaconate-calendar", "Deaconate Calendar", Calendar, { roles: DEACONATE_ROLES }),
  ...[
    { tab: "dept-amm", label: "Adventist Men", roles: ["men_ministry"] },
    { tab: "dept-awm", label: "Adventist Women", roles: ["women_ministry"] },
    { tab: "dept-aym", label: "Adventist Youth", roles: ["youth_leader"] },
    { tab: "dept-children", label: "Children's Ministry", roles: ["children_ministry"] },
    { tab: "dept-apm", label: "Possibility Ministries", roles: ["apm_leader"] },
    { tab: "dept-chaplaincy", label: "Chaplaincy", roles: ["chaplaincy"] },
  ].flatMap((dept) => [
    officeTab(`${dept.tab}-members`, `${dept.label} Members`, Users, { roles: dept.roles, hiddenFor: ["admin", "elder", "clerk"] }),
    officeTab(`${dept.tab}-calendar`, `${dept.label} Calendar`, Calendar, { roles: dept.roles, hiddenFor: ["admin", "elder", "clerk"] }),
    officeTab(`${dept.tab}-activities`, `${dept.label} Activities`, ClipboardList, { roles: dept.roles, hiddenFor: ["admin", "elder", "clerk"] }),
  ]),
];

/**
 * The rail, in the order a member meets it: the week's page first, then their
 * own places, the church's, and last the office's.
 *
 * Every row is a destination from the registry or a page of the office
 * console — a row cannot invent an href. A group's list holds all of its
 * pages including the section's own landing page, so nothing is reachable
 * only by guessing.
 */
export const railEntries: RailEntry[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", match: ["/dashboard"] },
  {
    label: "My Church",
    icon: User,
    items: [page("myAccount"), page("memberReports"), page("welfare"), page("prayerVisitation")],
  },
  {
    label: "Fellowship",
    icon: Megaphone,
    items: [
      page("fellowship"),
      page("announcements"),
      page("services"),
      page("testimonies"),
      page("childDedication"),
      page("membership"),
      page("ideas"),
      page("calendar"),
    ],
  },
  { label: "Materials", icon: BookOpen, items: [page("materials")] },
  {
    label: "Giving",
    icon: HandHeart,
    items: [page("give"), page("fundDrives"), page("inKind"), page("budget"), page("liveReports"), page("periodicalReports")],
  },
  { label: "About", icon: Building2, items: [page("about")] },
  { label: "Office", icon: ShieldCheck, items: officeItems },
];

/** May these roles see this row or page? */
export function canSee(
  entry: { roles?: readonly string[]; hiddenFor?: readonly string[] },
  roles: readonly string[]
): boolean {
  if (entry.hiddenFor && entry.hiddenFor.some((role) => roles.includes(role))) return false;
  if (!entry.roles) return true;
  return entry.roles.some((role) => roles.includes(role));
}

/**
 * The rail as these roles see it: gated rows and pages dropped, and a row
 * left with nothing under it dropped with them (an office tab a member may
 * not open is not a section they should see at all).
 */
export function railFor(roles: readonly string[]): RailEntry[] {
  return railEntries.flatMap((entry) => {
    if (!canSee(entry, roles)) return [];
    if (!entry.href && entry.items) {
      const items = entry.items.filter((item) => canSee(item, roles));
      return items.length === 0 ? [] : [{ ...entry, items }];
    }
    return [entry];
  });
}

/** Which row the rail should open and highlight — the most specific match. */
export type RailHere = { group: string | null; href: string | null };

export function railHere(pathname: string, tab: string | null, entries: RailEntry[]): RailHere {
  let best: RailHere = { group: null, href: null };
  let bestLength = -1;

  /**
   * How strongly this page claims the current location — higher wins.
   *
   * A `match` prefix is the group's broad claim (the Fellowship hub matches
   * the whole `/community` tree); an item that *is* the path is a far better
   * answer than one that merely contains it, so landing exactly on a page's
   * own href beats any prefix, and among prefixes the longest wins.
   */
  const measure = (item: RailItem): number => {
    // A console tab matches on the query, not the path: every one of them is
    // /administration, so the tab is what tells them apart.
    if (item.tab) return pathname === "/administration" && tab === item.tab ? 10_000 + item.tab.length : -1;
    if (pathname === item.href.replace(/\?.*$/, "")) return 100_000 + item.href.length;
    const patterns = item.match ?? [item.href];
    return patterns.reduce(
      (longest, prefix) =>
        pathname === prefix || pathname.startsWith(`${prefix}/`)
          ? Math.max(longest, prefix.length)
          : longest,
      -1
    );
  };

  for (const entry of entries) {
    if (entry.items) {
      for (const item of entry.items) {
        const length = measure(item);
        if (length > bestLength) {
          best = { group: entry.label, href: item.href };
          bestLength = length;
        }
      }
    } else if (entry.href) {
      const length = measure({ href: entry.href, label: entry.label, icon: entry.icon, match: entry.match });
      if (length > bestLength) {
        best = { group: null, href: entry.href };
        bestLength = length;
      }
    }
  }

  return bestLength >= 0 ? best : { group: null, href: null };
}

/**
 * The phone's tab bar: the four places members move between all week, and the
 * rail itself behind the last tab. "home" is chrome — the dashboard-or-site-
 * home tab, which also collapses history — and "menu" opens the rail, so the
 * phone carries the same navigation as the desktop rather than a cut-down map.
 */
export const tabKeys: ({ key: DestinationKey } | "home" | "menu")[] = [
  "home",
  { key: "fellowship" },
  { key: "materials" },
  { key: "give" },
  "menu",
];

/**
 * The account menu, at the foot of the rail. Short by design: the rail names
 * every place the church has, so this holds only the member's own page, the
 * calendar, and the console for staff.
 */
export const accountMenuKeys: { key: DestinationKey; staffOnly?: boolean }[] = [
  { key: "myAccount" },
  { key: "calendar" },
  { key: "administration", staffOnly: true },
];

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
