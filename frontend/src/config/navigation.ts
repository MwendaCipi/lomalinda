import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Armchair,
  Baby,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  Calendar,
  ClipboardList,
  Crown,
  Briefcase,
  FileText,
  Gift,
  HandHeart,
  Heart,
  HeartPulse,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  Music,
  Scale,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Undo2,
  UserCheck,
  Users,
} from "lucide-react";

/**
 * The navigation model — one registry of destinations, each with one canonical
 * href and one canonical label, so no surface can rename a place or invent a
 * second path to it.
 *
 * Every navigation surface renders from here:
 *
 * - the rail (`NavRail`) picks `railEntries`,
 * - the phone's tab bar picks `tabKeys` (Home is chrome; Admin is hidden from
 *   members who serve in no office),
 * - the dashboard's quick tiles pick `dashboardTiles`,
 * - the account menu picks `accountMenuKeys`,
 * - the marketing footer's columns pick `footerColumns`.
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
  /**
   * The section's place. Its hub page was retired: `/fellowship` now opens the
   * section's first page (Announcements), which the strip on top names as a
   * toggle among siblings — the card grid that duplicated it is gone. The
   * matchers still own the whole `/fellowship` tree so the section strip
   * appears on every page of it and old bookmarks keep landing inside.
   */
  fellowship: {
    href: "/announcements",
    label: "Fellowship",
    description: "Where the church family gathers — news, testimony and care.",
    icon: Megaphone,
    area: "fellowship",
    match: ["/fellowship", "/share", "/spiritual", "/announcements", "/community", "/enroll"],
  },
  announcements: {
    href: "/announcements",
    label: "Announcements",
    description: "Notices and updates shared with the church family.",
    icon: Megaphone,
    area: "fellowship",
    match: ["/announcements"],
  },
  /**
   * Moments — the church's photo and video wall, kept as event albums by
   * the administrators. A page of its own; the rail leaves it to the
   * Fellowship pages that link it (the announcements page among them).
   */
  moments: {
    href: "/share/moments",
    label: "Moments",
    description: "The church's events, album by album — kept by the administrators.",
    icon: Sparkles,
    area: "fellowship",
    match: ["/share/moments"],
  },
  testimonies: {
    href: "/spiritual/testimonies",
    label: "Testimonies",
    description: "Read and share how God is at work among us.",
    icon: Sparkles,
    area: "fellowship",
    match: ["/spiritual"],
  },
  /**
   * Prayer — the first of the two request desks and the Requests row's way
   * in. The strip on it names Visitation as the sibling, so the old combined
   * "Prayer & Visitation" desk is now two pages that sit beside each other.
   */
  prayerVisitation: {
    href: "/community/prayer",
    label: "Prayer Requests",
    short: "Prayer & Care",
    description: "Send a prayer request to the church's pastoral prayer team.",
    icon: Heart,
    area: "fellowship",
    match: ["/community"],
  },
  /**
   * Visitation — the second of the two request desks. Its own page, its own
   * form (with the map pin for where to come) and its own ledger; the strip
   * on it names Prayer as the sibling. It sits inside the Requests row so the
   * phone's tab still lands on Prayer first, with visitation one tap away.
   */
  visitation: {
    href: "/community/visitation",
    label: "Visitation Requests",
    short: "Visitation",
    description: "Ask for a pastoral, home or hospital visit — pin where to come.",
    icon: HeartHandshake,
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
    label: "Transfer",
    description: "Join through baptism or transfer, or request a transfer out.",
    icon: Users,
    area: "fellowship",
    match: ["/enroll"],
  },
  ideas: {
    href: "/support/ideas",
    label: "Ideas",
    short: "Ideas",
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
    label: "Money Giving",
    short: "Giving",
    description: "Give tithes and offerings by M-Pesa or bank transfer.",
    icon: HandHeart,
    area: "stewardship",
    // The section reads as "Money Giving" on the bars — except Ideas, which
    // belongs to Fellowship. Campaigns is deliberately absent: a fund drive
    // is Fund Drives' page, and claiming it here would keep the highlight
    // away from its own row.
    match: ["/give", "/support/in-kind", "/support/budget", "/support/financial", "/support/reports", "/support/periodical-reports"],
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
  financial: {
    href: "/support/financial",
    label: "Live Balances",
    short: "Live Balances",
    description: "What the church's treasury accounts hold right now.",
    icon: Activity,
    area: "stewardship",
    match: ["/support/financial"],
  },
  reports: {
    href: "/support/reports",
    label: "Reports",
    description: "The financial statements the church publishes.",
    icon: FileText,
    area: "stewardship",
    // The retired /support/periodical-reports path still highlights this row:
    // it redirects here, so a bookmarked link opens the statements it named.
    match: ["/support/reports", "/support/periodical-reports"],
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
  /**
   * The member's Requests row — the forms: prayer and visitation, child
   * dedication, joining. The row opens on the prayer & visitation form, the
   * most-made request, and the strip on it names the rest. The office answers
   * the same requests from the console's Requests desk, which is a different
   * page and is named by the desk's tile (`REQUESTS_TILE`); the two are
   * separate destinations on purpose, because a member asking and an officer
   * answering are two jobs.
   */
  requests: {
    href: "/community/prayer",
    label: "Requests",
    description: "Request prayer or a pastoral visit, dedicate a child, or join the church.",
    icon: HeartHandshake,
    area: "fellowship",
    match: ["/requests", "/community"],
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
 * Every row is a *place*, and the rail lists only places: a row either is a
 * page (`href`) or holds a section's pages (`items`). The pages a row holds do
 * not hang under it in the sidebar — they are the strip at the top of each of
 * them (`SectionNav`, drawn by the shell), so the rail stays short and every
 * page still shows its siblings one tap away.
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
  /**
   * For a page of one department: the `dept=` value that names it. The office
   * console holds every department's desk on one tab, so the department is
   * what tells two of those pages apart.
   */
  dept?: string;
  /**
   * Other `?tab=` values that are the same page — a page that folded two old
   * tabs into one (Meetings holds board and business) still lights up for a
   * deep link or a dashboard tile that names one of them.
   */
  aliasTabs?: readonly string[];
  /** Roles that may see it; absent means everyone. */
  roles?: readonly string[];
  /** Roles that hide it even where `roles` matches (the admin's rule). */
  hiddenFor?: readonly string[];
};

/** A row: a place — a page (`href`), or a section whose pages are `items`. */
export type RailRow = {
  label: string;
  icon: LucideIcon;
  href?: string;
  short?: string;
  match?: readonly string[];
  /** For a row that *is* a console tab, the `?tab=` value that is this page. */
  tab?: string;
  aliasTabs?: readonly string[];
  /** For a row that is one department's desk: the `?dept=` value naming it. */
  dept?: string;
  items?: RailRow[];
  roles?: readonly string[];
  hiddenFor?: readonly string[];
  /**
   * A row whose pages are the church's own records rather than a list here.
   * The Ministries and Departments headings are filled from whatever the
   * desk has created — they cannot be named in this file without going stale
   * the day a ministry is added — and `railFor` expands each group into one
   * row per area, each keeping the heading its group names.
   */
  fromDepartments?: DepartmentGroup;
  /** The heading a generated row belongs under, carried through expansion. */
  sectionKey?: RailSection;
};

/**
 * A heading the member belongs to nothing under. The rail renders it with a
 * request-to-join affordance instead of rows — the church's answer to a
 * member who would otherwise see the heading vanish with their own areas.
 */
export type RailJoinEntry = {
  label: string;
  icon: LucideIcon;
  href?: undefined;
  sectionKey?: RailSection;
  memberJoin: true;
};

export type RailEntry = RailRow | RailJoinEntry;

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
function officeTab(tab: string, label: string, icon: LucideIcon, extra: Partial<RailRow> = {}): RailRow {
  return { href: `/administration?tab=${tab}`, tab, label, icon, ...extra };
}

const DEACONATE_ROLES = ["deacon", "deaconess", "head_deacon", "head_deaconess", "admin"];
const REQUESTS_DESK_ROLES = ["elder", "clerk", "admin", "pastor", "chaplaincy", "children_ministry", "welfare_leader"];
/** Elders and clerks share the church's programmes; the register is the clerk's. */
const ELDERSHIP_ROLES = ["elder", "clerk", "admin"];
/** The clerk's desk: the register, the meetings' minutes and the transfers. */
const CLERKSHIP_ROLES = ["clerk", "admin"];

/**
 * Clerkship — the clerk's desk: the church's register, the minutes of the
 * board and business meetings, and the membership transfers in and out.
 *
 * The clerk keeps the books of membership and of every meeting the church
 * holds, so those four pages are one row rather than scattered through the
 * elders' strip. An administrator holds the desk too.
 */
export const clerkshipItems: RailRow[] = [
  officeTab("users", "User Management", Users, { roles: CLERKSHIP_ROLES }),
  // Board and business meetings are two rows of this strip, not a desk
  // behind another menu. The old "meetings" tab still opens the board list.
  officeTab("board", "Board Meetings", Armchair, {
    roles: CLERKSHIP_ROLES,
    aliasTabs: ["meetings"],
  }),
  officeTab("business", "Business Meetings", Briefcase, { roles: CLERKSHIP_ROLES }),
  officeTab("transfers", "Membership Requests", ClipboardList, { roles: CLERKSHIP_ROLES }),
];

/**
 * Eldership — the elders' desk: the church's programmes and its people's
 * requests, and the Leadership desk that appoints the church's areas.
 *
 * The register, the meetings' minutes and the transfers no longer ride this
 * strip: they are the clerk's own desk beside it (Clerkship). Elders and
 * clerks still share every remaining row here.
 */
export const eldershipItems: RailRow[] = [
  // Assigning the church's leaders rides the Eldership strip: appointing a
  // leader is work the offices do together, so it is a page of their desk
  // rather than a row of its own.
  officeTab("leaders", "Church Leadership", Crown, {
    roles: ELDERSHIP_ROLES,
    // The one-worder rides a phone; the desk's full name rides everywhere else.
    short: "Leadership",
  }),
  officeTab("settings", "Church Settings", Settings, { roles: ELDERSHIP_ROLES }),
  officeTab("announcements", "Announcements", Megaphone, { roles: ELDERSHIP_ROLES }),
  officeTab("requests", "Requests", HeartHandshake, { roles: REQUESTS_DESK_ROLES }),
];

/** The deaconate: the church's property, its duty and its ordinances. */
export const deaconateItems: RailRow[] = [
  officeTab("inventory", "Inventory", Boxes, { roles: DEACONATE_ROLES }),
  officeTab("deaconate-rota", "Duty Rota", ClipboardList, { roles: DEACONATE_ROLES }),
  officeTab("deaconate-members", "Deaconate Team", UserCheck, { roles: DEACONATE_ROLES }),
  officeTab("deaconate-calendar", "Deaconate Calendar", Calendar, { roles: DEACONATE_ROLES }),
];

/** Which heading a department is filed under. */
export type DepartmentGroup = "office" | "ministry" | "department";

/** The church's own record of a department, as the rail needs it. */
export type DepartmentSummary = {
  code: string;
  label: string;
  group: DepartmentGroup;
};

/** The mark each known department wears; one the desk invents gets a plain one. */
const DEPARTMENT_ICONS: Record<string, LucideIcon> = {
  amm: Users,
  awm: Heart,
  aym: Sun,
  children: Baby,
  ambassadors: Sparkles,
  apm: HandHeart,
  chaplaincy: Crown,
  choir: Music,
  music: Gift,
  personal_ministries: Megaphone,
  health: HeartPulse,
};

/**
 * The treasury's pages — the treasurer's desk, as its own row on the rail.
 *
 * It answers one question (what does the church hold, and where did it go),
 * which is why it is not buried among the office's people-and-programmes rows.
 */
export const treasuryItems: RailRow[] = [
  {
    href: "/administration/reconciliation",
    label: "Contributions Ledger",
    icon: Scale,
    match: ["/administration/reconciliation"],
    roles: ["treasurer", "admin"],
  },
  officeTab("accounts", "Church Accounts", Landmark, { roles: ["treasurer", "admin"] }),
  // Expenditure is no longer a page of this strip: it is one of the accounts
  // desk's own views (Church Accounts / Income / Expenditure), where recording
  // spending sits beside the accounts it debits. An old `?tab=expenditures`
  // link lands on the accounts desk.
  {
    href: "/administration/fund-drives",
    label: "Fund Drives",
    // No `short` here: the row reads Fund Drives at every width, on the rail
    // and on the strip alike.
    icon: Target,
    match: ["/administration/fund-drives"],
    roles: ["treasurer", "admin"],
  },
  officeTab("budget", "Church Budget", BarChart3, { roles: ["treasurer", "admin"] }),
  officeTab("refunds", "M-Pesa Refunds", Undo2, { roles: ["treasurer", "admin"] }),
];

/**
 * The rail, in the order a member meets it: the week's page first, the
 * church's life, then each office's own desk and the departments under it.
 *
 * Every row is a destination from the registry or a page of the office
 * console — a row cannot invent an href. A group's list holds all of its
 * pages including the section's own landing page, so nothing is reachable
 * only by guessing. Ministries and Departments hold neither: their pages are
 * the church's own records, read at render time (`fromDepartments`).
 */
export const railEntries: RailEntry[] = [
  // The member's own page, alone under the first heading.
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", match: ["/dashboard"], sectionKey: "dashboard" },
  {
    label: "Fellowship",
    icon: Megaphone,
    items: [
      page("announcements"),
      page("calendar"),
      page("moments"),
      page("testimonies"),
      page("ideas"),
    ],
  },
  { label: "Materials", icon: BookOpen, items: [page("materials")] },
  {
    label: "Money Giving",
    icon: HandHeart,
    // The rail's row keeps its own name — Giving — while the strip's heading
    // above it reads Money Giving; `page` copies the registry label, so the
    // one row is overridden here.
    items: [page("give", { label: "Giving" }), page("fundDrives"), page("inKind"), page("budget"), page("financial"), page("reports")],
  },
  // Asking the church for something is its own place, not a page of Fellowship:
  // prayer and visitation, dedication, joining — the member's requests live
  // here, while the office answers them at the console's Requests desk. The
  // dedicated and joining pages belong to this row too: a member opening them
  // is asking the church for something, not browsing what it shares.
  //
  // The row opens on the prayer & visitation form — the most-made request —
  // and the strip on it names the other ways to ask: dedication, joining. The
  // old `/requests` hub page is a redirect for links already in the world.
  {
    label: "Requests",
    icon: HeartHandshake,
    items: [
      page("prayerVisitation"),
      page("visitation"),
      page("childDedication"),
      page("membership"),
    ],
  },
  // The church's offices, each on the row it belongs to — an elder's work, a
  // clerk's work and the deacons' work are three different jobs, and the
  // treasurer's has always stood on its own. The register and the meetings'
  // minutes are the clerk's row, so they are back on a Clerkship of their
  // own rather than folded into the elders' strip.
  { label: "Eldership", icon: Armchair, items: eldershipItems, roles: ELDERSHIP_ROLES },
  { label: "Clerkship", icon: ClipboardList, items: clerkshipItems, roles: CLERKSHIP_ROLES },
  { label: "Treasury", icon: Landmark, items: treasuryItems, roles: ["treasurer", "admin"] },
  { label: "Deaconate", icon: Boxes, items: deaconateItems, roles: DEACONATE_ROLES },
  // The church's music. One page, not two: the desk opens straight onto its
  // own Members / Calendar row rather than a strip that only repeats its name.
  // The choir keeps its own desk under the Ministries heading, next to the
  // other ministries, where its area code is no longer held out.
  {
    label: "Music",
    icon: Music,
    items: [
      {
        href: "/administration?tab=leaders&dept=music",
        label: "Music",
        icon: Music,
        match: ["/administration"],
        tab: "leaders",
        dept: "music",
        roles: STAFF_ROLES,
      },
    ],
    roles: STAFF_ROLES,
    sectionKey: "ministry",
  },
  // The church's own areas, each one its own row under its own heading.
  // These two placeholders carry no pages of their own: `railFor` swaps each
  // for one row per ministry (or department), every row opening that area's
  // desk directly, and a group the desk has not filled yet disappears.
  {
    label: "Ministries",
    icon: HeartHandshake,
    fromDepartments: "ministry",
    roles: STAFF_ROLES,
    sectionKey: "ministry",
  },
  {
    label: "Departments",
    icon: Users,
    fromDepartments: "department",
    roles: STAFF_ROLES,
    sectionKey: "departments",
  },
];

/**
 * How the rail groups its rows. A heading is a reading aid, not a click
 * target — every row under it is a place, exactly as it was flat. The
 * member's own page reads first under a Dashboard heading of its own, the
 * church's life as one My church list, the church's service — its offices'
 * desks and its ministries — as one Service list, and the departments as a
 * Departments list of their own.
 */
export type RailSection = "dashboard" | "my-church" | "ministry" | "departments";

/** The heading each section goes by, on the rail. */
export const RAIL_SECTIONS: { key: RailSection; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "my-church", label: "My church" },
  { key: "ministry", label: "Ministry" },
  { key: "departments", label: "Departments" },
];

/** Which heading a row is filed under; a row with none sits before the first. */
const RAIL_SECTION_OF: Partial<Record<string, RailSection>> = {
  "Fellowship": "my-church",
  "Materials": "my-church",
  "Money Giving": "my-church",
  "Requests": "my-church",
  "Eldership": "ministry",
  "Clerkship": "ministry",
  "Treasury": "ministry",
  "Deaconate": "ministry",
};

/**
 * The rail, read as headings with the rows under each: the member's own page
 * first, alone, then the church's life, then the desks — which are the
 * leadership's side of the app.
 */
export function railSectionsFor(
  entries: RailEntry[]
): { key: RailSection; label: string; entries: RailEntry[] }[] {
  const grouped = new Map<RailSection, RailEntry[]>();
  for (const entry of entries) {
    // Anything unmapped falls to My church rather than vanishing from the rail.
    const key = entry.sectionKey ?? RAIL_SECTION_OF[entry.label] ?? "my-church";
    const list = grouped.get(key) ?? [];
    list.push(entry);
    grouped.set(key, list);
  }
  return RAIL_SECTIONS.map(({ key, label }) => ({
    key,
    label,
    entries: grouped.get(key) ?? [],
  })).filter((section) => section.entries.length > 0);
}

/**
 * The one page a rail row opens.
 *
 * A row is a *place*: it may name its own page (`href`) or be a section whose
 * first page is the way in (`items[0]`). Either way the rail has something to
 * link to, because the pages below a row no longer hang under it — they are
 * the strip at the top of each of them (`SectionNav`).
 */
export function entryHref(entry: RailEntry): string | null {
  if ("memberJoin" in entry) return null;
  return entry.href ?? entry.items?.[0]?.href ?? null;
}

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
/** The rail's wording for an area — the short forms, so a 256px rail never
 *  has to ellipsis "Adventist Possibility Ministries (APM)" into mush. The
 *  full names stay everywhere else (the directory, the desks, the titles). */
/** The areas the rail carries in a row of their own rather than under the
 *  Ministries heading. */
const RAIL_AREA_CODES_MOVED = new Set(["music"]);

const RAIL_AREA_LABELS: Record<string, string> = {
  amm: "AMM",
  awm: "AWM",
  aym: "Young Adults",
  apm: "APM",
  chaplaincy: "Chaplaincy",
  children: "Children",
  personal_ministries: "PM",
  health: "Health",
};

/**
 * The areas every member may visit on the rail, whatever roles they hold:
 * the music ministry, the deaconate and the Possibility Ministries desk are
 * the church's open doors — a member with no other area still sees these.
 */
export const RAIL_MEMBER_SPECIAL_CODES = ["music", "deaconate", "apm"];

/** What a caller tells the rail about the signed-in member. */
export type RailMember = {
  /** The roles on the account; empty for a member with no office. */
  roles: readonly string[];
  /** The codes of the departments the member belongs to or serves. */
  departmentCodes: readonly string[];
};

export function railFor(
  member: RailMember,
  departments: readonly DepartmentSummary[] = []
): RailEntry[] {
  const { roles, departmentCodes: myCodes } = member;
  const isStaff = roles.some((role) => STAFF_ROLES.includes(role));
  const memberRowRoles: readonly string[] = isStaff ? STAFF_ROLES : ["member"];
  return railEntries.flatMap((entry): RailEntry[] => {
    // The static config never carries a join entry — those are minted below.
    if ("memberJoin" in entry) return [];
    if (!canSee(entry, roles)) return [];
    // A heading of the church's own areas: it expands into one row per
    // ministry (or department), each row opening that area's desk directly
    // and keeping the heading its group names. A group the desk has not
    // filled yet contributes nothing, so the heading vanishes with it.
    if (entry.fromDepartments) {
      const group = entry.fromDepartments;
      const isMinistriesHeading = group === "ministry";
      const visible = departments
        .filter((department) => department.group === group)
        // The music areas have a row of their own, so the heading stops
        // generating them.
        .filter((department) => !RAIL_AREA_CODES_MOVED.has(department.code))
        // A plain member sees the areas they belong to — plus, under
        // Ministries, the church's open doors (music, deaconate, APM).
        // The office sees every row.
        .filter((department) =>
          isStaff ||
          myCodes.includes(department.code) ||
          (isMinistriesHeading && RAIL_MEMBER_SPECIAL_CODES.includes(department.code)),
        );
      const rows = visible.map((department) => ({
        label: RAIL_AREA_LABELS[department.code] ?? department.label,
        icon: DEPARTMENT_ICONS[department.code] ?? Users,
        href: `/administration?tab=leaders&dept=${department.code}`,
        match: ["/administration"],
        tab: "leaders",
        dept: department.code,
        roles: memberRowRoles,
        sectionKey: entry.sectionKey,
      }));
      // A member who belongs to no area under a heading gets an invitation
      // instead of an empty list: the row is inert (the rail renders the
      // join affordance itself), carried so the heading never disappears.
      if (rows.length === 0 && !isStaff) {
        return [{
          label: entry.label,
          icon: entry.icon,
          href: undefined,
          sectionKey: entry.sectionKey,
          memberJoin: true,
        } as RailEntry];
      }
      return rows;
    }
    if (!entry.href && entry.items) {
      const items = entry.items.filter((item) => canSee(item, roles));
      return items.length === 0 ? [] : [{ ...entry, items }];
    }
    return [entry];
  });
}

/** Which row the rail should open and highlight — the most specific match. */
export type RailHere = { group: string | null; href: string | null };

/** The query values that tell two pages of one route apart. */
export type RailQuery = { tab?: string | null; dept?: string | null };

export function railHere(pathname: string, query: RailQuery | null, entries: RailEntry[]): RailHere {
  const tab = query?.tab ?? null;
  const dept = query?.dept ?? null;
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
  const measure = (item: RailRow): number => {
    if (!item.href) return -1;
    // A console tab matches on the query, not the path: every one of them is
    // /administration, so the tab is what tells them apart. A page that took
    // over an older tab answers to that name too.
    if (item.tab) {
      if (pathname !== "/administration" || tab === null) return -1;
      const names = [item.tab, ...(item.aliasTabs ?? [])];
      if (!names.includes(tab)) return -1;
      // A department's own desk beats the directory that lists it, and the
      // directory is not "here" while one department is open — otherwise
      // both rows would light up at once.
      if (item.dept) return dept === item.dept ? 20_000 + item.dept.length : -1;
      return dept ? -1 : 10_000 + tab.length;
    }
    if (dept) {
      // A department's desk answers to nothing else while it is open.
      return -1;
    }
    const bare = item.href.replace(/\?.*$/, "");
    if (pathname === bare) {
      // An href carrying a query is only "here" when it is the query that
      // says so: the directory rows point at `?tab=leaders` like every other
      // console page, and scoring them by bare path would light them on every
      // page of the console. (The bare-path branch below is for plain pages.)
      return /\?/.test(item.href) ? -1 : 100_000 + item.href.length;
    }
    if (/\?/.test(item.href)) {
      // A query-ful href never claims a path it is not exactly on.
      return -1;
    }
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
    if (!("memberJoin" in entry) && entry.items) {
      for (const item of entry.items) {
        const length = measure(item);
        if (length > bestLength && item.href) {
          best = { group: entry.label, href: item.href };
          bestLength = length;
        }
      }
    } else if (entry.href) {
      const length = measure({
        href: entry.href,
        label: entry.label,
        icon: entry.icon,
        match: entry.match,
        tab: entry.tab,
        aliasTabs: entry.aliasTabs,
        // A department row is one desk of the leaders tab: the dept is what
        // tells it apart from the desk itself and from its sibling rows.
        dept: entry.dept,
      });
      if (length > bestLength) {
        best = { group: null, href: entry.href };
        bestLength = length;
      }
    }
  }

  return bestLength >= 0 ? best : { group: null, href: null };
}/**
 * The phone's tab bar: the places members move between all week. "requests"
 * is the member's own page for asking the church for something and "admin" is
 * the office console, the last tab, hidden from a member who serves in no
 * office — so their bar is Fellowship, Materials, Giving and Requests. Home
 * has no tab of its own: the topbar's church mark is the way back to the
 * dashboard, which is the floor of the back stack.
 */
export const tabKeys: ({ key: DestinationKey } | "home" | "admin")[] = [
  { key: "fellowship" },
  { key: "materials" },
  { key: "give" },
  { key: "requests" },
  "admin",
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

/**
 * The dashboard's quick tiles: the four everyday actions, as cards beside the
 * week's announcements.
 *
 * Keys only — the label, description and icon come from the registry above, so
 * a tile cannot rename a place the bars call something else, and a destination
 * renamed once is renamed on the dashboard too. Four is the number that fits
 * two rows beside the announcement card and stays level with it: the rail
 * already carries every other destination, so a longer list would be a second
 * copy of the map competing with the card next to it.
 */
export const dashboardTiles: readonly DestinationKey[] = [
  "announcements",
  "give",
  "requests",
  "calendar",
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
    heading: "Money Giving",
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

