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
  Megaphone,
  MessagesSquare,
  Music,
  Receipt,
  Scale,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Undo2,
  UserCheck,
  Users,
  Wallet,
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
    description: "Where the church family gathers — news, testimony, ideas and care.",
    icon: Megaphone,
    area: "fellowship",
    // Materials rides this section now (it is a page of Fellowship, not a
    // place of its own), so its tree belongs to the section's matchers too.
    match: ["/fellowship", "/share", "/spiritual", "/announcements", "/community", "/enroll", "/materials"],
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
   * Chat — the church talking to itself: the area rooms a member belongs to,
   * direct messages between members, and the thread that reaches the office.
   * It is chrome rather than a rail row: a phone reaches it from the bottom
   * bar and a PC from the top bar's own button, so it needs no place on the
   * map. The registry entry is what gives the page its name, its mark and its
   * active matchers on those two bars.
   */
  chat: {
    href: "/chat",
    label: "Chat",
    short: "Chat",
    description: "Your area rooms, direct messages, and a line to the church office.",
    icon: MessagesSquare,
    area: "fellowship",
    match: ["/chat"],
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
  /**
   * Sharing — testimonies and ideas in one place. They were two toggles; a
   * member arrives in the same frame of mind for either, so one page asks
   * which one it is. The old Ideas path still leads here.
   */
  testimonies: {
    href: "/spiritual/testimonies",
    label: "Sharing",
    short: "Sharing",
    description: "Share a testimony of what God has done, or an idea that could help the church.",
    icon: Sparkles,
    area: "fellowship",
    match: ["/spiritual/testimonies", "/support/ideas"],
  },
  /**
   * Prayer — the first of the two request desks and the Requests row's way
   * in. The strip on it names Visitation as the sibling, so the old combined
   * "Prayer & Visitation" desk is now two pages that sit beside each other.
   */
  prayerVisitation: {
    href: "/community/prayer",
    label: "Prayer Requests",
    short: "Prayer",
    description: "You don't have to carry it alone. Send a prayer request and get help in prayer.",
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
    short: "Dedication",
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
    short: "Giving",
    description: "Give tithes and offerings by M-Pesa or bank transfer.",
    icon: HandHeart,
    area: "stewardship",
    // The section reads as Giving on the bars — except Ideas, which
    // belongs to Fellowship. Campaigns is deliberately absent: a fund drive
    // is Fund Drives' page, and claiming it here would keep the highlight
    // away from its own row.
    match: ["/give", "/support/in-kind", "/support/budget", "/support/financial", "/support/reports", "/support/periodical-reports"],
  },
  fundDrives: {
    href: "/support/campaigns",
    label: "Fund Drives",
    short: "Drives",
    description: "Active fund drives and how far along they are.",
    icon: Target,
    area: "stewardship",
    match: ["/support/campaigns"],
  },
  inKind: {
    href: "/support/in-kind",
    label: "In-Kind Giving",
    short: "In-Kind",
    description: "Offer goods, equipment, services or time instead of money.",
    icon: Gift,
    area: "stewardship",
    match: ["/support/in-kind"],
  },
  budget: {
    href: "/support/budget",
    label: "Church Budget",
    short: "Budget",
    description: "Published annual budgets and how departments plan to use them.",
    icon: BarChart3,
    area: "stewardship",
    match: ["/support/budget"],
  },
  financial: {
    href: "/support/financial",
    label: "Live Balances",
    short: "Balances",
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
  /**
   * The member's own giving record — the table of what they gave, with its
   * receipts and its privacy eye. It lived on the giving page once, where the
   * record displaced the act of giving; the account menu links it here now,
   * one narrow matcher under My Account so the heading stays its own.
   */
  myGivings: {
    href: "/member/givings",
    label: "My Givings",
    description: "Your money and in-kind giving, as one timeline — with statuses, receipts and totals.",
    icon: Receipt,
    area: "account",
    match: ["/member/givings"],
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
    description: "The church's members and the roles they hold, and the church's own settings.",
    icon: ShieldCheck,
    area: "office",
    audience: STAFF_ROLES,
    match: ["/administration"],
  },
  /**
   * The member's own map of the church's areas, open to everyone: two sub-navs
   * — Ministry and Department — over the areas they belong to and the ones
   * they could join, each a card that opens the area read-only (its
   * leadership, its roll and its calendar). The writing side stays in the
   * office console, which is why this can be every member's while the console
   * is the offices'.
   */
  myAreas: {
    href: "/my-areas",
    label: "Ministry",
    short: "Ministry",
    description: "The ministries and departments you are part of — and the ones you could join.",
    icon: HeartHandshake,
    area: "fellowship",
    match: ["/my-areas"],
  },
  /**
   * Requests — the four asking-for-something desks after Fellowship is merged:
   * Prayer Requests, Visitation Requests, Child Dedication, Join/Transfer.
   * Their forms each begin with a "Request type" selector so the member picks
   * which one they are filling in.
   */
  requests: {
    href: "/requests",
    label: "Requests",
    description: "Prayer, visitation, dedication, joining — four request types, one place.",
    icon: HeartHandshake,
    area: "fellowship",
    // The old sibling pages answer to this one chip too, so a deep link into
    // any of them still reads as the requests place and keeps it lit.
    match: ["/requests", "/enroll", "/community", "/community/prayer", "/community/visitation", "/community/child-dedication"],
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
 * The destinations that draw their own heading: the dashboard (a personal
 * greeting) and About (a marketing page a signed-out visitor reads too). The
 * shell shows a heading for every other page it frames — the office console
 * included, where each tab or department desk names itself through its rail
 * row and the overview falls back to the console's own name and description.
 */
const HEADERLESS_DESTINATIONS = new Set<DestinationKey>(["about", "dashboard"]);

/** The longest prefix a destination claims — the tie-break between close matchers. */
function matchLength(dest: Destination): number {
  return Math.max(...(dest.match ?? [dest.href]).map((pattern) => pattern.length));
}

/**
 * The heading the shell shows above a page: the destination the path is — by
 * its exact href where one matches, and by the most specific matcher
 * otherwise, so `/member/reports` is not read as `/member`. Returns the whole
 * destination so the title and its one-line description stay in one place.
 */
export function pageHeaderFor(pathname: string): Destination | null {
  const all = Object.entries(destinations) as [DestinationKey, Destination][];
  const showable = (key: DestinationKey) => !HEADERLESS_DESTINATIONS.has(key);
  // Two destinations may share one href — a section alias (`fellowship`,
  // `requests`) and the page it opens on. The page is the one with the
  // narrower set of matchers, so it takes the heading.
  const exact = all
    .filter(([, dest]) => dest.href === pathname)
    .sort((a, b) => (a[1].match?.length ?? 0) - (b[1].match?.length ?? 0));
  if (exact.length > 0) {
    const [key, dest] = exact[0];
    return showable(key) ? dest : null;
  }
  const active = all.filter(([key, dest]) => showable(key) && isActive(dest, pathname));
  if (active.length === 0) return null;
  active.sort((a, b) => matchLength(b[1]) - matchLength(a[1]));
  return active[0][1];
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
  /**
   * The name this page shows in a section's strip (`SectionNav`) when that
   * differs from its rail row and page heading — the strip may read "Money
   * Giving" while every other surface keeps "Giving".
   */
  stripLabel?: string;
  /** One-line description the shell shows under the page's name. */
  description?: string;
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
  /** The name a section's strip shows for this page, when it differs. */
  stripLabel?: string;
  /** One-line description the shell shows under the page's name. */
  description?: string;
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
  /**
   * A row that is one of the church's offices or ministries — a leadership
   * desk, or the music ministry. The rail files it under My Ministry when the
   * viewer belongs to it (holds the desk's office, or sits on the music roll)
   * and folds it under the other ministries when they do not, so a heading
   * never hides a desk the church keeps.
   */
  railMinistry?: true;
  /** The area code whose membership makes a `railMinistry` row the viewer's own. */
  railAreaCode?: string;
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
  officeTab("users", "User Management", Users, {
    roles: CLERKSHIP_ROLES,
    short: "Users",
    description: "The church's accounts, their roles and their standing.",
  }),
  // Board and business meetings are two rows of this strip, not a desk
  // behind another menu. The old "meetings" tab still opens the board list.
  officeTab("board", "Board Meetings", Armchair, {
    roles: CLERKSHIP_ROLES,
    aliasTabs: ["meetings"],
    short: "Board",
    description: "The board's minutes, agendas, attendance and follow-ups.",
  }),
  officeTab("business", "Business Meetings", Briefcase, {
    roles: CLERKSHIP_ROLES,
    short: "Business",
    description: "The church's business meetings and the decisions they carry.",
  }),
  officeTab("transfers", "Membership Requests", ClipboardList, {
    roles: CLERKSHIP_ROLES,
    short: "Transfers",
    description: "Membership transfers into the church and out of it.",
  }),
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
    description: "The church's offices and its areas, with each leader and assistant.",
  }),
  officeTab("settings", "Church Settings", Settings, {
    roles: ELDERSHIP_ROLES,
    short: "Settings",
    description: "The church's name, contacts, giving details and the messages it sends.",
  }),
  officeTab("announcements", "Announcements", Megaphone, {
    roles: ELDERSHIP_ROLES,
    short: "News",
    description: "Notices and updates shared with the church family.",
  }),
  officeTab("requests", "Requests", HeartHandshake, {
    roles: REQUESTS_DESK_ROLES,
    description: "The asks the church has received — joining, prayer, visits, dedications and welfare.",
  }),
];

/** The deaconate: the church's property, its duty and its ordinances. The
 *  team leads the strip — a desk is its people before its things. */
export const deaconateItems: RailRow[] = [
  officeTab("deaconate-members", "Deaconate Team", UserCheck, {
    roles: DEACONATE_ROLES,
    short: "Team",
    description: "The deacons and deaconesses who serve the church's property, duty and ordinances.",
  }),
  officeTab("inventory", "Inventory", Boxes, {
    roles: DEACONATE_ROLES,
    description: "The church's property register and the movements of each item.",
  }),
  officeTab("deaconate-rota", "Duty Rota", ClipboardList, {
    roles: DEACONATE_ROLES,
    description: "The deacons' and deaconesses' duty rosters for the church's services.",
  }),
  officeTab("deaconate-calendar", "Deaconate Calendar", Calendar, {
    roles: DEACONATE_ROLES,
    short: "Calendar",
    description: "Communion services, foot washing and the ordinances the desk keeps.",
  }),
  officeTab("deaconate-funding", "Funding & Accounts", Wallet, {
    roles: DEACONATE_ROLES,
    short: "Funding",
    description: "Local Church Budget allocations, transactions ledger, and funding requests.",
  }),
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
  sabbath_school: BookOpen,
  welfare: HandHeart,
  dorcas: Sparkles,
  development: Landmark,
};

/**
 * A one-line description for each known area, keyed by its code — the small
 * paragraph under an area's name on its desk. An area's own description (set
 * when the desk writes one) wins where it carries one.
 */
export const DEPARTMENT_BLURBS: Record<string, string> = {
  eldership: "The church's elders — its spiritual leadership and the programmes it keeps.",
  clerkship: "The church's records — the membership register, the minutes and the letters.",
  deaconate: "The church's property, its duty rota, and the ordinances it serves.",
  amm: "The Adventist Men's ministry — connected to the AMO account for men's ministries work.",
  awm: "Women encouraging one another through fellowship, discipleship and care.",
  aym: "Young people growing in faith,  friendship, leadership and service.",
  children: "Nurturing children into a loving, lifelong relationship with Jesus.",
  ambassadors: "Young adults growing together in faith, service and leadership.",
  apm: "Belonging and full participation for people with disabilities, orphans, widows and caregivers.",
  chaplaincy: "A ministry of presence, comfort and prayer in places of need.",
  health: "The church's health ministry — wholeness of body, mind and spirit.",
  sabbath_school: "The church's Sabbath School — its classes, its teachers and the lesson study that opens the Sabbath.",
  personal_ministries: "Equipping every member for witnessing, Bible study and outreach.",
  welfare: "Practical support and compassion for church members and neighbours in need.",
  dorcas: "Providing food, clothing, and compassionate service in the spirit of Dorcas.",
  development: "Planning, infrastructure, sanctuary building, and church plot development.",
  // Loma Linda says "Church Choir", but the area code is "choir" — the desk's
  // own page and the rail both label it Church Choir.
  music: "The church's music — its singing groups and the seasons they sing.",
  choir: "The church's choir — the songs it rehearses and the services it leads.",
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
    short: "Ledger",
    icon: Scale,
    match: ["/administration/reconciliation"],
    roles: ["treasurer", "admin"],
    description: "Every contribution the church has received, reconciled line by line.",
  },
  officeTab("accounts", "Church Accounts", Landmark, {
    roles: ["treasurer", "admin"],
    short: "Accounts",
    description: "The church's treasury accounts, their balances and their movements.",
  }),
  // Expenditure is no longer a page of this strip: it is one of the accounts
  // desk's own views (Church Accounts / Income / Expenditure), where recording
  // spending sits beside the accounts it debits. An old `?tab=expenditures`
  // link lands on the accounts desk.
  {
    href: "/administration/fund-drives",
    label: "Fund Drives",
    // The rail row reads Fund Drives at every width; the phone's strip chip
    // shortens to Drives, as the member's Giving strip does.
    short: "Drives",
    icon: Target,
    match: ["/administration/fund-drives"],
    roles: ["treasurer", "admin"],
    description: "Active fund drives and how far along each one is.",
  },
  officeTab("budget", "Church Budget", BarChart3, {
    roles: ["treasurer", "admin"],
    short: "Budget",
    description: "The church's annual budgets and how the areas plan to use them.",
  }),
  officeTab("refunds", "M-Pesa Refunds", Undo2, {
    roles: ["treasurer", "admin"],
    short: "Refunds",
    description: "M-Pesa refunds issued back to givers, and where each one stands.",
  }),
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
  // The logo at the head of the rail is the way back to the dashboard, so
  // there is no row for it here — the rail opens on the church's life.
  {
    label: "Fellowship",
    icon: Megaphone,
    // Two things have no row of their own and ride here instead. Materials is
    // something the church shares, read beside the news and the calendar —
    // giving its slot back to the phone's bar frees the room the Ministries
    // and Departments tabs need there. And the requests: prayer, visitation,
    // dedication and joining used to stand on a rail row of their own, but a
    // member asking the church for something is already in Fellowship — the
    // phone's tab stays lit on every /community page — so the four forms have
    // one place of their own on the strip rather than four chips of their own
    // in the rail. That one page opens with the request type as its first
    // field, which is the pick the rest of the form hangs off.
    items: [
      page("announcements"),
      page("calendar"),
      page("moments"),
      page("testimonies"),
      page("materials"),
      page("requests"),
    ],
  },
  {
    label: "Giving",
    icon: HandHeart,
    // The rail's row and the page heading read Giving; `page` copies the
    // registry label, so the one row is overridden here. The strip names this
    // page Money Giving — the one surface that says so — while its phone chip
    // reads Money: six chips share a phone's width, and the leading "Money" is
    // what tells this row of the strip apart from In-Kind's.
    items: [page("give", { label: "Giving", short: "Money", stripLabel: "Money Giving" }), page("fundDrives"), page("inKind"), page("budget"), page("financial"), page("reports")],
  },
  // The church's offices, each on the row it belongs to — an elder's work, a
  // clerk's work and the deacons' work are three different jobs, and the
  // treasurer's has always stood on its own. The register and the meetings'
  // minutes are the clerk's row, so they are back on a desk of their own
  // own rather than folded into the elders' strip.
  { label: "Eldership", icon: Armchair, items: eldershipItems, roles: ELDERSHIP_ROLES, railMinistry: true },
  { label: "Clerkship", icon: ClipboardList, items: clerkshipItems, roles: CLERKSHIP_ROLES, railMinistry: true },
  { label: "Treasury", icon: Landmark, items: treasuryItems, roles: ["treasurer", "admin"], railMinistry: true },
  { label: "Deaconate", icon: Boxes, items: deaconateItems, roles: DEACONATE_ROLES, railMinistry: true },
  // The church's music. One page, not two: the desk opens straight onto its
  // own Members / Calendar row rather than a strip that only repeats its name.
  // The choir keeps its own desk among the ministries, where its area code is
  // no longer held out. Every member reads the desk — what it does is the
  // office's to change. It counts as the member's own ministry when they sit
  // on the music roll; otherwise it folds in with the other ministries.
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
        description: DEPARTMENT_BLURBS.music,
      },
    ],
    railMinistry: true,
    railAreaCode: "music",
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
    sectionKey: "my-ministry",
  },
  {
    label: "Departments",
    icon: Users,
    fromDepartments: "department",
    roles: STAFF_ROLES,
    sectionKey: "my-ministry",
  },
];

/**
 * How the rail groups its rows. A heading is a reading aid, not a click
 * target — every row under it is a place, exactly as it was flat. The
 * member's own page reads first under a Dashboard heading of its own; the
 * church's life comes next as one My church list; then the areas the member
 * belongs to, and, folded away, the other areas they can visit or join.
 */
export type RailSection =
  | "my-church"
  | "my-ministry"
  | "other-ministry";

/** Which heading a row is filed under; a row with none sits before the first. */
const RAIL_SECTION_OF: Partial<Record<string, RailSection>> = {
  "Fellowship": "my-church",
  "Giving": "my-church",
};

/** One heading in the rail, with the rows filed under it. */
export type RailSectionGroup = {
  key: RailSection;
  label: string;
  entries: RailEntry[];
};

function railEntrySortLabel(entry: RailEntry): string {
  return ("short" in entry && entry.short ? entry.short : entry.label).toLocaleLowerCase();
}

/**
 * The rail, read as headings with the rows under each: the church's life, then
 * the areas they belong to, then the other ministries and departments they may
 * visit or join. Every heading reads the same way — plain label, rows beneath,
 * nothing folded away. Empty groups are omitted.
 */
export function railSectionsFor(entries: RailEntry[]): RailSectionGroup[] {
  const grouped = new Map<RailSection, RailEntry[]>();
  for (const entry of entries) {
    // Anything unmapped falls to My church rather than vanishing from the rail.
    const key = entry.sectionKey ?? RAIL_SECTION_OF[entry.label] ?? "my-church";
    const list = grouped.get(key) ?? [];
    list.push(entry);
    grouped.set(key, list);
  }
  const groups: RailSectionGroup[] = [];
  const push = (key: RailSection, label: string) => {
    const rows = grouped.get(key);
    if (rows && rows.length > 0) {
      groups.push({
        key,
        label,
        entries: [...rows].sort((a, b) => railEntrySortLabel(a).localeCompare(railEntrySortLabel(b))),
      });
    }
  };
  push("my-church", "My church");
  // Departments and ministries share the same two headings, as they do in the
  // member's Ministry map: joined areas under My Ministry, the rest beside it.
  push("my-ministry", "My Ministry");
  push("other-ministry", "Other Ministries");
  return groups;
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
 *  has to ellipsis "Adventist Possibility Ministries" into mush. The
 *  full names stay everywhere else (the directory, the desks, the titles). */
const RAIL_AREA_CODES_MOVED = new Set([
  "music",
  "beginners",
  "kindergarten",
  "primary",
  "junior",
  "teens",
  "pathfinders",
  // The men's and women's fellowships' sub-units. They belong inside the AMM
  // and AWM desks (whose `units` field names them), not as rows of their own.
  "young_couples",
  "single_parents",
]);

/**
 * Areas that read as a fellowship inside another desk, never a rail row of
 * their own — matched by name, so a desk the church created with the same
 * wording is filed the same way whatever code it was given.
 */
const RAIL_UNIT_LABELS_MOVED = new Set(["young couples", "single parents"]);

/** The two fellowships that are one sex's own: the other sex may still belong
 *  by the desk's own hand, but the row is not offered them to join. */
const SEX_ONLY_RAIL = new Set(["amm", "awm"]);

/**
 * The ministries the church appoints rather than opens. Personal Ministries is
 * led by the office's own hand, so a member who is not already on it is not
 * offered it to join. (The leadership desks — Elders', Clerk's, Treasury,
 * Deaconate — are the same: they are held by office, never joined, so a member
 * who does not hold one never sees it on the rail at all.)
 */
const NON_JOINABLE_MINISTRY_CODES = new Set(["personal_ministries"]);

/**
 * The departments a member joins by belonging — the age- and gender-based
 * fellowships. Any of these the member is not yet on rides the folded
 * "Other Ministries" heading, so an AYM member is offered AMM or AWM (their
 * own sex's — the sex gate above decides) and an Ambassadors member is offered
 * AYM. Office-held desks remain unoffered to members who do not hold them.
 */
const JOINABLE_DEPARTMENT_CODES = new Set(["aym", "amm", "awm"]);


const RAIL_AREA_LABELS: Record<string, string> = {
  amm: "AMM",
  awm: "AWM",
  aym: "AYM",
  apm: "APM",
  // Loma Linda calls the choir the Church Choir.
  choir: "Church Choir",
  chaplaincy: "Chaplaincy",
  children: "Children",
  personal_ministries: "PM",
  health: "Health",
  welfare: "Welfare",
  dorcas: "Dorcas",
  development: "Development",
};

/**
 * The areas every member may visit on the rail, whatever roles they hold:
 * the music ministry, the deaconate and the Possibility Ministries desk are
 * the church's open doors — a member with no other area still sees these.
 */

/** What a caller tells the rail about the signed-in member. */
export type RailMember = {
  /** The roles on the account; empty for a member with no office. */
  roles: readonly string[];
  /** Every area the member may open — for an office account, the whole church.
   *  The department rows read this: the member's own department group, and
   *  every department for the church's offices. Defaults to `tieCodes`. */
  departmentCodes?: readonly string[];
  /** Only the areas the member genuinely belongs to or serves in. The ministry
   *  rows read this. Defaults to `departmentCodes` when absent. */
  tieCodes?: readonly string[];
  /** The member's recorded sex, for the two fellowships that are one sex's
   *  own. A blank field offers both, the desk's own hand deciding. */
  sex?: string;
};

/**
 * The rail as the signed-in member sees it.
 *
 * The church's own areas share two headings. **My Ministry** holds every
 * department and ministry the member belongs to or serves in; **Other
 * Ministries** holds the other areas they may visit or join. The leadership
 * desks and appointed ministries remain visible only to the offices that
 * hold them.
 */
export function railFor(
  member: RailMember,
  departments: readonly DepartmentSummary[] = []
): RailEntry[] {
  const { roles } = member;
  // Every area the member may open — for the church's offices, the whole
  // church. Non-owned areas share the Other Ministries heading.
  const areaCodes = member.departmentCodes ?? member.tieCodes ?? [];
  // Only the areas they genuinely belong to or serve in — My Ministry.
  const tieCodes = member.tieCodes ?? areaCodes;
  const sex = (member.sex || "").trim().toLowerCase();
  const isStaff = roles.some((role) => STAFF_ROLES.includes(role));
  const memberRowRoles: readonly string[] = isStaff ? STAFF_ROLES : ["member"];
  return railEntries.flatMap((entry): RailEntry[] => {
    // The static config never carries a join entry — those are minted below.
    if ("memberJoin" in entry) return [];
    // A leadership desk, or the music ministry. A desk is held by office,
    // never joined: one the viewer holds reads under My Ministry, and one they
    // do not hold is not offered at all. Music is the church's open door — the
    // viewer's own when they sing in it, folded with the joinable ministries
    // when they do not.
    if (entry.railMinistry) {
      // A ministry with its own row (Music) is the church's open door: any
      // signed-in member may read it, but it reads as their ministry only
      // when they sit on its roll. A leadership desk (Elder's, Clerk's,
      // Treasury, Deaconate) is held by office: a member with a system role
      // reaches it, but it reads as their own ministry only when they hold
      // the desk's specific role.
      const isVisible = entry.railAreaCode
        ? true
        : canSee(entry, roles);
      const isOwned = entry.railAreaCode
        ? tieCodes.includes(entry.railAreaCode)
        : (entry.roles ?? []).some((role) => roles.includes(role) && role !== "admin");
      if (!isVisible) return [];
      return isOwned
        ? [{ ...entry, sectionKey: "my-ministry" }]
        : [{ ...entry, sectionKey: "other-ministry" }];
    }
    if (!entry.fromDepartments && !canSee(entry, roles)) return [];
    // A heading of the church's own areas: it expands into one row per
    // ministry (or department), each opening that area's desk directly.
    if (entry.fromDepartments) {
      const group = entry.fromDepartments;
      const rows = departments
        .filter((department) => department.group === group)
        // Music and choir stand outside the headings — music has a row of its
        // own, and the choir lives in the Music desk. The AMM/AWM sub-units
        // (Young Couples, Single Parents) read inside those desks.
        .filter((department) => !RAIL_AREA_CODES_MOVED.has(department.code))
        .filter((department) => !RAIL_UNIT_LABELS_MOVED.has(department.label.trim().toLowerCase()))
        .filter((department) => {
          if (!SEX_ONLY_RAIL.has(department.code)) return true;
          // The member's own fellowship always shows; the other sex's is
          // hidden unless the desk has already put them on its roll.
          if (areaCodes.includes(department.code)) return true;
          if (!sex) return true;
          return (department.code === "amm" ? "male" : "female") === sex;
        })
        // Departments and ministries share the same two rail headings. A
        // member sees their own areas together, then other visitable/joinable
        // areas under the folded Other Ministries heading. Staff can see all
        // departments because they appoint and oversee them.
        .filter((department) => {
          if (group === "department") {
            if (isStaffRole(roles)) return true;
            return tieCodes.includes(department.code) || JOINABLE_DEPARTMENT_CODES.has(department.code);
          }
          // Staff and admins see every ministry (including appointed ones like
          // PM) — they oversee all areas. The non-joinable gate only hides an
          // area from regular members who are not already on its roll.
          if (isStaffRole(roles)) return true;
          return tieCodes.includes(department.code) || !NON_JOINABLE_MINISTRY_CODES.has(department.code);
        });
      return rows.map((department) => {
        const isMine = tieCodes.includes(department.code);
        const sectionKey: RailSection = isMine ? "my-ministry" : "other-ministry";
        // The row names the area in full — the desk's page heading reads it —
        // and keeps the short form for the rail column itself.
        const label = department.label;
        return {
          label,
          short: RAIL_AREA_LABELS[department.code],
          icon: DEPARTMENT_ICONS[department.code] ?? Users,
          href: `/administration?tab=leaders&dept=${department.code}`,
          match: ["/administration"],
          tab: "leaders",
          dept: department.code,
          // The desk's own blurb, so its page heading has a line under it too.
          description: DEPARTMENT_BLURBS[department.code],
          roles: memberRowRoles,
          sectionKey,
        };
      });
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

/**
 * Retired spellings a `?dept=` value may carry: the rail once named AMM's
 * desk `amo`, so links saved then still answer to the desk's real code.
 */
const DEPARTMENT_DESK_ALIASES: Record<string, string> = {
  amo: "amm",
};

/** The desk code a `?dept=` value names — a retired spelling maps forward. */
export function departmentDeskCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return DEPARTMENT_DESK_ALIASES[code] ?? code;
}

export function railHere(pathname: string, query: RailQuery | null, entries: RailEntry[]): RailHere {
  const tab = query?.tab ?? null;
  const dept = departmentDeskCode(query?.dept);
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
 * The phone's tab bar: the places members move between all week. The last
 * tab is "chat" — the church talking (the area rooms, direct messages and the
 * office line) — which rides the bar's tail on a phone because a PC reaches
 * the same page from the top bar's own button instead. Requests ride inside
 * Fellowship now, so the phone keeps one Fellowship tab instead of splitting
 * out a second asking-for-something tab. "Ministry" is the church's ministries
 * and departments as the member's own map of them, which every member may read
 * (the office console keeps the writing side). Home has no tab of its own: the
 * topbar's church mark is the way back to the dashboard, which is the floor of
 * the back stack. Materials has no tab either — it is a page of Fellowship
 * now. Staff still reach the console from the account menu.
 */
export const tabKeys: ({ key: DestinationKey } | "home" | "admin")[] = [
  { key: "fellowship" },
  { key: "myAreas" },
  { key: "give" },
  { key: "chat" },
];

/**
 * The account menu, at the foot of the rail. Short by design: the rail names
 * every place the church has, so this holds only the member's own page, the
 * calendar, and the console for staff.
 */
export const accountMenuKeys: { key: DestinationKey; staffOnly?: boolean }[] = [
  { key: "myAccount" },
  { key: "myGivings" },
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
