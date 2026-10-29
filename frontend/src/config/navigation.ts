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
  Droplets,
  Briefcase,
  FileText,
  Gift,
  GraduationCap,
  HandHeart,
  Images,
  Heart,
  HeartPulse,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessagesSquare,
  Music,
  Receipt,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  UserCheck,
  UserPlus,
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

/** The eldership's codes — every office the board seats, whatever its number. */
export const ELDER_ROLES: readonly string[] = ["elder", "first_elder", "second_elder", "third_elder"];

/**
 * The roles that reach Administration itself — the church's register, its
 * roles and its settings. The elders hold every right the administrator
 * holds across the church's desks, but the console stays with the
 * administrator and the clerk: they work from their own desks instead.
 */
export const CONSOLE_ROLES: readonly string[] = STAFF_ROLES.filter((role) => !ELDER_ROLES.includes(role));

export type NavDestination = {
  /** Canonical href — the only path for this destination, everywhere. */
  href: string;
  /** Canonical label — the one name this place goes by. */
  label: string;
  /** Optional shorter label for surfaces with very little room (tab bar). */
  short?: string;
  /**
   * What the bottom tab bar alone calls this place, when the bar's word
   * differs from the section's name — the Giving desk is Stewardship on
   * the phone's bar without renaming it anywhere else.
   */
  tabLabel?: string;
  /**
   * What the shell prints *above* this page, when that differs from the name
   * its row carries — the Giving desk is Stewardship in its heading, because
   * "Giving" is the toggle a reader presses *inside* that section and a
   * heading has to name the place it opens onto.
   */
  heading?: string;
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
    description: "Where the church family gathers.",
    icon: Megaphone,
    area: "fellowship",
    // The section's own tree and the pages that redirect into it. Materials is
    // no longer one of them: it stands on a rail row and a phone tab of its
    // own, so claiming its tree here would light this tab on a page that is
    // not Fellowship's — and would file the page under a section it left.
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
    description: "Your ministry and department rooms, direct messages, and a line to the church office.",
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
    description: "The church's events, album by album.",
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
    // "Sharing" read as testimonies-only, so the name says what sits inside:
    // a testimony, an idea, or both.
    label: "Testimonies and Ideas",
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
    description: "Ask for a pastoral, home or hospital visit.",
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
  /**
   * Prayer Cells — the fellowship's small companies of prayer, kept by the
   * Personal Ministries desk. Members read the register here and ask to join
   * one; the desk that owns the church's week forms the cells and keeps
   * their rolls (and each cell's own group chat) on its strip.
   */
  prayerCells: {
    href: "/prayer-cells",
    label: "Prayer Cells",
    short: "Cells",
    description: "The church's prayer cells — find one and ask to join it.",
    icon: HandHeart,
    area: "fellowship",
    match: ["/prayer-cells"],
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
    // The member's own Giving desk. The public Support Us page keeps /give
    // on the marketing site — the two are separate pages so neither changes
    // shape under its readers.
    href: "/member/giving",
    label: "Giving",
    short: "Giving",
    // The bottom bar names the whole section, not just its front page.
    tabLabel: "Stewardship",
    // And so does the heading, for the same reason: this is Stewardship's
    // front door, and "Giving" is the toggle under it that says which view of
    // the section is open. Naming the page Giving left the section's own name
    // nowhere a reader could see it on a phone.
    heading: "Stewardship",
    description: "Give tithes and offerings by M-Pesa or bank transfer.",
    icon: HandHeart,
    area: "stewardship",
    // The section reads as Giving on the bars — except Ideas, which
    // belongs to Fellowship. Campaigns is deliberately absent: a fund drive
    // is Fund Drives' page, and claiming it here would keep the highlight
    // away from its own row.
    // The member's own record of giving rides here too: My Givings is a page
    // of this section now (see the Stewardship section below), so the bars and
    // the strip read the same place while it is open.
    match: ["/member/giving", "/member/givings", "/support/in-kind", "/support/budget", "/support/financial", "/support/reports", "/support/periodical-reports"],
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
    label: "My Profile",
    short: "My Profile",
    description: "Your details, your picture, your family and your giving history.",
    icon: Users,
    area: "account",
    // `/member/reports` is its own destination below, so it is excluded here.
    match: ["/member"],
  },
  /**
   * The member's display, theme, accessibility and notification settings.
   */
  preferences: {
    href: "/member/preferences",
    label: "Preferences",
    short: "Preferences",
    description: "App appearance, theme, and notification settings.",
    icon: SlidersHorizontal,
    area: "account",
    match: ["/member/preferences"],
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
    description: "Your money and in-kind giving, as one timeline.",
    icon: Receipt,
    area: "account",
    match: ["/member/givings"],
  },
  /**
   * The church's property register — furniture, equipment and other assets
   * tracked by the deaconate. Members may browse it; only officers may add or
   * move items. The register lives at /support/property so it stays in the
   * Stewardship section rather than the deaconate admin console.
   */
  churchProperty: {
    href: "/support/property",
    label: "Church Property",
    short: "Property",
    description: "Furniture, equipment and assets the deaconate department maintains for the church.",
    icon: Boxes,
    area: "stewardship",
    match: ["/support/property"],
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
    // The account menu opens the console itself — role-specific desks (such
    // as Clerkship) are reached from the rail, so this must not fall into the
    // bare route's role-based landing redirect.
    //
    // It opens on the console's **first** toggle, User Management, so the door
    // always lands where the Administration strip begins. Naming a later page
    // here made the strip open with a toggle that was not the one lit first.
    href: "/administration?tab=users",
    label: "Administration",
    short: "Admin",
    description: "The church's members and the roles they hold, and the church's own settings.",
    icon: ShieldCheck,
    area: "office",
    // The console's door opens for administrator and clerk only — an elder
    // reads every desk through the church, but not the register or the
    // settings (see CONSOLE_ROLES).
    audience: CONSOLE_ROLES,
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
    description: "The ministries and departments you are part of, and the ones you could join.",
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
    description: "Prayer, visitation, dedication and joining.",
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
  /** What the shell prints above this page, where it differs from its row. */
  heading?: string;
  /**
   * The name this page shows in a section's strip (`SectionNav`) when that
   * differs from its rail row and page heading.
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
  /** What the shell prints above this page, where it differs from its row. */
  heading?: string;
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
  /**
   * The desk draws its own strip (`setCustomToggles`), so the shell must not
   * draw its `items` as one. The treasury is the case: its views are one line
   * the pages themselves keep (Givings, Accounts, Budget and the rest), and
   * a shell strip of the same pages would flash up first and then
   * be replaced by the desk's own — two navigations for one desk, disagreeing
   * on every toggle.
   */
  ownStrip?: boolean;
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
    heading: dest.heading,
    icon: dest.icon,
    match: dest.match,
    ...extra,
  };
}

/** A page that is a tab of the office console rather than a route of its own. */
function officeTab(tab: string, label: string, icon: LucideIcon, extra: Partial<RailRow> = {}): RailRow {
  return { href: `/administration?tab=${tab}`, tab, label, icon, ...extra };
}

/**
 * Who the deaconate's desk answers to: the deacons and deaconesses, their two
 * heads, and the admin. Exported because the desk is drawn in two places — the
 * console's own strip names its pages, and the area desk on the Ministry map
 * draws the same views as toggles of one page — and both ask the same question
 * of the viewer.
 */
export const DEACONATE_ROLES = ["deacon", "deaconess", "head_deacon", "head_deaconess", "admin"];
// Join and membership-transfer requests reach the three who answer them —
// admin, elder and clerk — plus the pastoral and care roles that share the desk.
const REQUESTS_DESK_ROLES = ["elder", "clerk", "admin", "pastor", "chaplaincy", "children_ministry", "welfare_leader"];
/** Elders and clerks share the church's programmes; the register is the clerk's.
 *
 *  The eldership seats are First, Second and Third Elder — those are the codes
 *  the leaders table grants and the server checks — so the seat codes ride
 *  beside the plain "elder" an account may still hold from the old role list.
 *  Exported so the desk's own gate (see `DepartmentDetail`) answers with this
 *  same list rather than a second copy that could drift out of step with it. */
export const ELDERSHIP_ROLES = ["elder", "first_elder", "second_elder", "third_elder", "clerk", "admin"];
/** The clerk's desk: the meetings' minutes and the membership transfers. */
const CLERKSHIP_ROLES = ["clerk", "admin"];
/**
 * The office console — the roster and the church's own settings — is not a
 * rail section anymore: the account menu is its only door, so the rail
 * carries the church's working desks and the console sits one menu away.
 * Roles stay hardcoded in the register; there is no role desk to open.
 */

/**
 * Clerkship — the clerk's desk. The pages are ordered by the work a clerk
 * reaches for most: answering arrivals and transfers, then the signatures
 * waiting on the clerk's own pen (every letter the church writes passes the
 * pastor first and then the clerk), then the writing the clerk does — the
 * correspondence and the church's messages — and after that the less
 * frequent meeting, register and accounts work. Profiles open from User
 * Management.
 */
export const clerkshipItems: RailRow[] = [
  // The clerk's register answers to a tab of its own — Administration keeps
  // `?tab=users` as its first toggle. When both doors shared that one
  // address, the console could not tell which of them was used: opening
  // Clerkship arrived on Administration's heading and strip, and the two
  // read as one place (they have traded places more than once). One address
  // each settles it — the page renders the same register either way, and
  // the URL alone now says whose strip and heading belong to it.
  // `members` is the tab the clerk's register used to carry; the rail still
  // answers to it so a link saved then lands on this row.
  officeTab("clerk-users", "User Management", Users, {
    roles: CLERKSHIP_ROLES,
    aliasTabs: ["members"],
    short: "Members",
    description: "The church register: users, profiles and their assigned roles.",
  }),
  officeTab("clerk-requests", "Requests", UserPlus, {
    roles: CLERKSHIP_ROLES,
    aliasTabs: ["transfers"],
    short: "Requests",
    description: "New members, ministry joins and membership transfers waiting on an answer.",
  }),
  // Every letter the church writes — from any desk — waits first for the
  // pastor's pen and then the clerk's, and this is the one page that holds
  // them all: the desks' own letters views show only their own paper, so
  // without it the clerk would chase a signature desk by desk. It offers
  // the two things the clerk does with paper — sign (or send it back with
  // a reason) and download the finished sheet for the stamp — and writes
  // none of its own, the way the pastorate's Letter Approvals page does.
  // The short name is "Approvals", not "Letters": the Correspondences row
  // beside it already reads "Letters" in a narrow strip.
  officeTab("clerk-letters", "Letter Approvals", FileText, {
    roles: CLERKSHIP_ROLES,
    short: "Approvals",
    description: "Letters from every desk awaiting the church clerk's signature, and the signed sheets to download.",
  }),
  officeTab("correspondence", "Correspondences", FileText, {
    roles: CLERKSHIP_ROLES,
    short: "Letters",
    description: "Write, share and print the church's official correspondence.",
  }),
  // The church's own outbox. It moved here from the eldership because it is
  // no longer only the mailbox at info@: the clerk is the one who writes to
  // the church, so the letters and the messages the church sends belong on
  // the same desk. It answers to the tab it always did, so a link to it —
  // and the sync of who holds it — is unchanged.
  officeTab("emails", "Messaging", Mail, {
    roles: CLERKSHIP_ROLES,
    short: "Messaging",
    description: "Letters arriving at info@sdalomalinda.or.ke, and the messages the church sends.",
  }),
  officeTab("meetings", "Meetings", Calendar, {
    roles: CLERKSHIP_ROLES,
    aliasTabs: ["board", "business"],
    short: "Meetings",
    description: "Church board and business meetings, agendas, files and minutes.",
  }),
  // The clerk keeps the church's own books, so the desk carries its accounts
  // beside the minutes: the church budget and the two funds the church's
  // welfare and outreach sit in — LCB, Msamaria Mwema and Evangelism.
  officeTab("clerkship-funding", "Requests", Wallet, {
    roles: CLERKSHIP_ROLES,
    short: "Requests",
    description: "Funding requests, church funds and their balances and movements.",
  }),
];

/**
 * The eldership's pages, written once — the one list its strip draws.
 *
 * The rail's Eldership row opens the desk itself, and so does a phone's
 * Eldership card; but the desk's own views and the console's pages used to be
 * two different strips, so the same desk named a different set of pages in a
 * hand and on a screen. These seven are the church's desk either way: the
 * elders' roll, its baptismal class and the church's calendar, which the desk
 * keeps, and the leadership register, the board, the asks, the wall and the
 * accounts, which the console holds. The deaconate's rota is kept under its
 * own desk, not nested under Eldership. The seven chips sit four a row on a
 * phone and as one line on a wide screen, at every door.
 * The labels are one word at every width, the strip being long now; the one
 * hybrid is Announcements, which reads "Announce" in a hand and in full on
 * a desk.
 *
 * Church Settings moved to Administration, where the roster and the roles
 * stand with it; the meetings' minutes and the transfers are the clerk's own
 * desk beside this one (Clerkship). Elders and clerks share these pages.
 */
export const eldershipViews: {
  key: "baptismal-class" | "leaders" | "calendar" | "sharing" | "requests" | "moments" | "funding" | "rota";
  label: string;
  short?: string;
  icon: LucideIcon;
  href: string;
  description: string;
}[] = [
  // The board of notices leads the desk: an officer opening it is publishing
  // to the church first, so Sharing is both the strip's first page and the
  // one every default door lands on.
  {
    key: "sharing",
    label: "Sharing",
    short: "Sharing",
    icon: Sparkles,
    href: "/administration?tab=announcements",
    description: "Publish announcements and share a daily thought with the church.",
  },
  // The baptismal class: who the elders are preparing for the font, their
  // walk from studying to baptism, kept by the desk itself.
  {
    key: "baptismal-class",
    label: "Baptismal",
    icon: Droplets,
    href: "/my-areas?area=eldership&view=baptismal-class",
    description: "The members being prepared for baptism, their walk from studying to the font.",
  },
  // Assigning the church's leaders: appointing a leader is work the offices do
  // together, so it is a page of their desk rather than a row of its own.
  {
    key: "leaders",
    label: "Leadership",
    icon: Crown,
    href: "/administration?tab=leaders",
    description: "The church's offices, ministries and departments, with each leader and assistant.",
  },
  // The church's days as the desk keeps them.
  {
    key: "calendar",
    label: "Events",
    icon: Calendar,
    href: "/my-areas?area=eldership&view=calendar",
    description: "The church's calendar, with the gatherings the elders keep.",
  },
  {
    key: "requests",
    label: "Requests",
    icon: HeartHandshake,
    href: "/administration?tab=requests",
    description: "The asks the church has received.",
  },
  {
    key: "moments",
    label: "Moments",
    icon: Images,
    href: "/administration?tab=eldership-moments",
    description: "Document a moment — pictures and video links of the church's days, on the Moments wall.",
  },
  // The elders answer for the church's money the same way the deaconate
  // does: the desk reads every treasury account — LCB and Msamaria Mwema
  // among them — with the movements on each.
  {
    key: "funding",
    label: "Requests",
    short: "Requests",
    icon: Wallet,
    href: "/administration?tab=eldership-funding",
    description: "Funding requests, church treasury accounts, balances and movements.",
  },
  {
    key: "rota",
    label: "Duty Rota",
    icon: ClipboardList,
    href: "/my-areas?area=eldership&view=rota",
    description: "Eldership's own rota, separate from Deaconate duties.",
  },
];

/**
 * The same seven as rail rows, so the rail, the shell's strip and the desk's
 * own strip can never name a different set.
 *
 * A console page answers on its `?tab=`, which is how the console's own pages
 * are told apart; a desk view rides its address, which is what keeps the two
 * devices on the same list rather than two.
 */
export const eldershipItems: RailRow[] = eldershipViews.map((view) => ({
  href: view.href,
  label: view.label,
  short: view.short,
  icon: view.icon,
  description: view.description,
  roles: view.key === "requests" ? REQUESTS_DESK_ROLES : ELDERSHIP_ROLES,
  // The tab a console page answers on is the one its address carries —
  // "Moments" rides `eldership-moments`, "Funding" `eldership-funding` — so
  // the rail lights the desk the reader is standing on.
  ...(view.href.includes("?tab=")
    ? { tab: new URLSearchParams(view.href.split("?")[1]).get("tab") ?? view.key }
    : {}),
}));

/**
 * The deaconate's own pages, written once: the desk is read in two places, and
 * each one names the same five.
 *
 * `tab` is the console page the rail opens (the URL names which page is on
 * screen there), `view` is that same page as a view of the desk's one page on
 * the Ministry map, where there is no rail to offer them — a phone has none at
 * all. The labels, the short forms and the blurbs live here so the console's
 * strip, the phone overview's cards and the area desk's toggles can never
 * disagree about the desk's shape or what a page is called.
 */
export const deaconateViews: {
  view: "members" | "inventory" | "rota" | "moments" | "calendar" | "funding";
  tab: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  description: string;
}[] = [
  {
    view: "members",
    tab: "deaconate-members",
    label: "Deaconate Team",
    short: "Team",
    icon: UserCheck,
    description: "The deacons and deaconesses who serve the church's property, duty and ordinances.",
  },
  {
    view: "inventory",
    tab: "inventory",
    label: "Church Property",
    short: "Property",
    icon: Boxes,
    description: "The church's property register and the movements of each item.",
  },
  {
    view: "rota",
    tab: "deaconate-rota",
    label: "Duty Rota",
    icon: ClipboardList,
    description: "The deacons' and deaconesses' duty rosters for the church's services.",
  },
  {
    view: "moments",
    tab: "deaconate-moments",
    label: "Moments",
    icon: Images,
    description: "Document a moment — pictures and video links of the church's days, on the Moments wall.",
  },
  {
    view: "calendar",
    tab: "deaconate-calendar",
    label: "Calendar",
    short: "Calendar",
    icon: Calendar,
    description: "Communion services, foot washing and the ordinances the desk keeps.",
  },
  {
    view: "funding",
    tab: "deaconate-funding",
    label: "Requests",
    short: "Requests",
    icon: Wallet,
    description: "Funding requests, Local Church Budget allocations and the transactions ledger.",
  },
];

/** The deaconate: the church's property, its duty and its ordinances. The
 *  team leads the strip — a desk is its people before its things. */
export const deaconateItems: RailRow[] = deaconateViews.map((page) =>
  officeTab(page.tab, page.label, page.icon, {
    roles: DEACONATE_ROLES,
    short: page.short,
    description: page.description,
  })
);

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
  education: GraduationCap,
  dorcas: Sparkles,
  development: Landmark,
};

/**
 * A one-line description for each known area, keyed by its code — the small
 * paragraph under an area's name on its desk. An area's own description (set
 * when the desk writes one) wins where it carries one.
 */
export const DEPARTMENT_BLURBS: Record<string, string> = {
  eldership: "The church's elders.",
  clerkship: "The church's records.",
  deaconate: "The church's property, its duty rota, and the ordinances it serves.",
  amm: "The Adventist Men's ministry.",
  awm: "Women encouraging one another through fellowship, discipleship and care.",
  aym: "Young people growing in faith,  friendship, leadership and service.",
  children: "Nurturing children into a loving, lifelong relationship with Jesus.",
  ambassadors: "Young adults growing together in faith, service and leadership.",
  apm: "Belonging and full participation for people with disabilities, orphans, widows and caregivers.",
  chaplaincy: "A ministry of presence, comfort and prayer in places of need.",
  health: "The church's health ministry.",
  sabbath_school: "The church's Sabbath School.",
  personal_ministries: "Equipping every member for witnessing, Bible study and outreach.",
  welfare: "Practical support and compassion for church members and neighbours in need.",
  education: "Christian education in the church and its schools: the study of God's word, our schools, and the students they serve.",
  dorcas: "Providing food, clothing, and compassionate service in the spirit of Dorcas.",
  development: "Planning, infrastructure, sanctuary building, and church plot development.",
  music: "The church's music.",
  // Loma Linda calls the choir the Church Choir — the name rides the
  // department's own row (`use-departments` reads it as Church Choir) — and it
  // reads without a line under its name at all: the name, who leads it and the
  // roll say what the area is, so nothing is written here for it.
  choir: "",
};

/**
 * One name for the ministry map and every ministry and department desk read
 * from it — the leadership console's directory and each area opened in it.
 *
 * The shell's heading used to follow whatever was on screen: the map named
 * whichever half its toggles held, and each area renamed the page as it was
 * opened, so the heading and the line under it changed with every move on a
 * wide screen (the band is phone-optional chrome — on a phone the strip names
 * the place). Both are fixed here so every surface the Ministry section draws
 * reads the same heading and description throughout, and the two places that
 * write it (`my-areas`, `department-hub`) cannot drift apart.
 */
export const MINISTRIES_AND_DEPARTMENTS_HEADING = {
  label: "Ministries & Departments",
  description: "Every ministry and department of the church, with its leaders, members and calendar.",
} as const;

/**
 * The static heading and description for the Treasury desk, ensuring it stays
 * fixed throughout all treasury toggles (individual givings, summary, accounts,
 * fund drives, expenses, requests, failed).
 */
export const TREASURY_HEADING = {
  label: "Treasury",
  description: "The church's treasury accounts, ledgers, fund drives and budget.",
} as const;

/**
 * The treasury's pages — the treasurer's desk, as its own row on the rail.
 *
 * It answers one question (what does the church hold, and where did it go),
 * which is why it is not buried among the office's people-and-programmes rows.
 */
export const treasuryItems: RailRow[] = [
  {
    href: "/administration/treasury",
    label: "Contributions Ledger",
    short: "Ledger",
    icon: Scale,
    match: ["/administration/treasury"],
    roles: ["treasurer", "admin", "elder", "first_elder", "second_elder", "third_elder"],
    description: "Every contribution the church has received, reconciled line by line.",
  },
  officeTab("accounts", "Church Accounts", Landmark, {
    roles: ["treasurer", "admin", "elder", "first_elder", "second_elder", "third_elder"],
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
    roles: ["treasurer", "admin", "elder", "first_elder", "second_elder", "third_elder"],
    description: "Active fund drives and how far along each one is.",
  },
  officeTab("budget", "Church Budget", BarChart3, {
    roles: ["treasurer", "admin", "elder", "first_elder", "second_elder", "third_elder"],
    short: "Budget",
    description: "The church's annual budgets and how the ministries and departments plan to use them.",
  }),
  // M-Pesa Refunds is no longer a page of this strip. A refund is one line's
  // own affair now: it is issued from the Contributions Ledger, where the
  // gift it returns sits, and it will be asked for through the Requests desk
  // like every other ask the office answers. The old `?tab=refunds` link
  // still opens the desk, so a refund already in flight can still be watched.
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
    description: "Where the church family gathers.",
    // One thing has no row of its own and rides here instead: the requests.
    // Prayer, visitation, dedication and joining used to stand on a rail row
    // of their own, but a member asking the church for something is already in
    // Fellowship — the phone's tab stays lit on every /community page — so the
    // four forms have one place of their own on the strip rather than four
    // chips of their own in the rail. That one page opens with the request type
    // as its first field, which is the pick the rest of the form hangs off.
    items: [
      page("announcements"),
      page("calendar"),
      page("moments"),
      page("testimonies"),
      page("prayerCells"),
      page("requests"),
    ],
  },
  // Materials stands on a row of its own: the church's study shelf is a place a
  // member goes to, not a page of the week's news, so it keeps a rail row and
  // the phone's bar carries it too (see `tabKeys`). It is a plain row rather
  // than a one-page section — the strip on it is the page's own shelves, handed
  // to the shell, so there are no siblings for a section strip to name.
  { ...page("materials"), sectionKey: "my-church" },
  {
    label: "Stewardship",
    icon: HandHeart,
    description: "Returning tithes, giving offerings and supporting the church's ministries.",
    // The rail's row, the strip heading and the page all read Giving for the
    // money page — `page` copies the registry label, so no override rides
    // here. In-Kind is no longer a chip of its own: the Giving page carries
    // a "Give in Kind" button that opens the same form as a modal, so the
    // destination stays in the registry for the links that name it.
    // My Givings sits beside Giving — the act, then its record — so the
    // member's own giving is a door of this section, not only a row of the
    // account menu.
    items: [
      page("give"),
      page("churchProperty"),
      page("fundDrives"),
      page("budget"),
      page("financial"),
      page("reports"),
    ],
  },
  // The church's offices, each on the row it belongs to — an elder's work, a
  // clerk's work and the deacons' work are three different jobs, and the
  // treasurer's has always stood on its own. The office console (the roster
  // and the church's settings) is deliberately not here: the account menu is
  // its only door, so the rail carries the desks of ongoing work.
  { label: "Eldership", icon: Armchair, href: "/my-areas?area=eldership&view=sharing", items: eldershipItems, roles: ELDERSHIP_ROLES, railMinistry: true, description: DEPARTMENT_BLURBS.eldership },
  { label: "Clerkship", icon: ClipboardList, items: clerkshipItems, roles: CLERKSHIP_ROLES, railMinistry: true, description: DEPARTMENT_BLURBS.clerkship },
  // The treasury's row names the desk; its pages are the desk's own strip (see
  // `ownStrip`), so the rail never draws a second, older list of them.
  { label: "Treasury", icon: Landmark, items: treasuryItems, roles: ["treasurer", "admin", "elder", "first_elder", "second_elder", "third_elder"], railMinistry: true, ownStrip: true, description: "The church's treasury accounts, ledgers, fund drives and budget." },
  { label: "Deaconate", icon: Boxes, items: deaconateItems, roles: DEACONATE_ROLES, railMinistry: true, railAreaCode: "deaconate", description: DEPARTMENT_BLURBS.deaconate },
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
  "Materials": "my-church",
  "Stewardship": "my-church",
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
  // The Treasury is a ministry of the church's record now, but the rail
  // already carries it as a section of its own (treasuryItems) — so the
  // ministries heading must not mint a second row beside it.
  "treasury",
  // Eldership is a ministry of the record too (0197), filed the same way:
  // the rail's Eldership section already names the desk.
  "eldership",
  // Clerkship is a ministry of the record now (0201), and the rail's
  // Clerkship section already names the desk.
  "clerkship",
  // The Deaconate has its own rail entry and views (deaconateItems), so the
  // department/ministry heading must not mint a second row beside it.
  "deaconate",
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
  amm: "Adventist Men",
  awm: "Adventist Women",
  aym: "Adventist Youth",
  apm: "Adventist Possibility",
  // Loma Linda calls the choir the Church Choir.
  choir: "Church Choir",
  chaplaincy: "Chaplaincy",
  children: "Children",
  // The rail reads the desk in full, as the user asked: the row has room for
  // the words, and "PM" is an abbreviation only its AMM/AWM neighbours know.
  personal_ministries: "Personal Ministries",
  health: "Health",
  welfare: "Welfare",
  education: "Education",
  dorcas: "Dorcas",
  development: "Development",
};  /**
   * The areas every member may visit on the rail, whatever roles they hold:
   * the music ministry, the deaconate and the Possibility Ministries desk are
   * the church's open doors — a member with no other area still sees these.
   */

export const OPEN_DOOR_AREA_CODES = new Set(["music", "apm", "deaconate"]);

/**
 * The two areas whose desk carries no Moments view: the Treasury and the
 * Clerkship. Every other ministry and department keeps Moments — the days it
 * lived, read from the desk that lived them — because those desks are the
 * church's programme life. These two are its office record desks: the money
 * and the minutes, kept as books rather than as the church's days, so the
 * wall is not theirs to keep.
 */
const MOMENTS_LESS_AREA_CODES = new Set(["treasury", "clerkship"]);

/** Does this area's desk carry a Moments view? One rule, asked by the strip
 *  that draws a desk's pages and by the view itself, so the two can never
 *  disagree about which areas have the page. */
export function areaHasMoments(code: string): boolean {
  return !MOMENTS_LESS_AREA_CODES.has(code.trim().toLowerCase());
}

/**
 * The two areas Messaging is not a view of — the same two. The Treasury and
 * the Clerkship keep books rather than the church's people: their work goes
 * out as receipts and minutes, never as a text to a roll, so every other
 * ministry and department desk carries the Messaging toggle.
 */
const MESSAGING_LESS_AREA_CODES = new Set(["treasury", "clerkship"]);

/** Does this area's desk carry a Messaging view? One rule, asked by the strip
 *  that draws a desk's pages and by the view itself, so the two can never
 *  disagree about which areas have the page. */
export function areaHasMessaging(code: string): boolean {
  return !MESSAGING_LESS_AREA_CODES.has(code.trim().toLowerCase());
}

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
        ? tieCodes.includes(entry.railAreaCode) || (entry.roles ?? []).some((role) => roles.includes(role) && role !== "admin")
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
export type RailQuery = {
  tab?: string | null;
  dept?: string | null;
  /** The whole query, for a row whose address names its place — `?area=`. */
  search?: string;
};

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
      if (/\?/.test(item.href)) {
        // A desk opened through the ministry map names its place in the query —
        // the eldership's roll and calendar are two views of one area — so the
        // params the row carries decide, and only on the path they name. Every
        // other query-ful href (the console's `?tab=` pages) is settled above.
        if (/[?&]area=/.test(item.href)) {
          const wanted = new URLSearchParams(item.href.split("?")[1]);
          const current = new URLSearchParams(query?.search ?? "");
          if ([...wanted.entries()].every(([key, value]) => current.get(key) === value)) {
            return 60_000 + item.href.length;
          }
        }
        return -1;
      }
      return 100_000 + item.href.length;
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
 * the back stack. Materials rides right after Fellowship — the study shelf is
 * read all week, so it sits early on the bar — and the ministry map takes the
 * place between Stewardship and Chat. Staff still reach the console from the
 * account menu.
 */
export const tabKeys: ({ key: DestinationKey } | "home" | "admin")[] = [
  { key: "fellowship" },
  { key: "materials" },
  { key: "give" },
  { key: "myAreas" },
  { key: "chat" },
];

/**
 * The account menu, at the foot of the rail. Short by design: the rail names
 * every place the church has, so this holds only the member's own pages and
 * the console for staff. The church calendar is deliberately not here — it is
 * a place of the church, not of the member's account, and the rail, the
 * dashboard and the Fellowship strip already carry it.
 */
export const accountMenuKeys: { key: DestinationKey; staffOnly?: boolean }[] = [
  { key: "myAccount" },
  { key: "preferences" },
  { key: "myGivings" },
  { key: "administration", staffOnly: true },
];

/**
 * The Requests desk's own address — the congregation panel's link into it.
 *
 * The dashboard's Requests *tile* is no longer two-faced: it is the plain
 * `requests` destination for everyone, administrators and elders included, so
 * a member asks the same way whoever they are. The desk is where the offices
 * *answer*; it keeps its row on the rail and this link beside the counts,
 * rather than becoming the tile a member lands on when they need prayer.
 */
export const REQUESTS_DESK_HREF = "/administration?tab=requests";

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
    // The footer is the landing page's, and the request desks (prayer,
    // visitation) are reached from the app, not from a visitor's first page.
    links: [
      { key: "calendar" },
      { key: "materials" },
      { key: "announcements" },
    ],
  },
  {
    // In-kind is the public giving page's own form rather than the member's
    // in-kind desk: the footer is a visitor's, and /support/in-kind sits
    // behind the sign-in wall. Fund Drives is left out for the same reason —
    // its index is a member page, and there is no visitor-facing list to send
    // them to yet.
    //
    // "Support Us" is the marketing site's name for the giving page (the
    // header and the landing hero say the same); the registry keeps
    // "Giving" for the app, where members know the place by that name.
    heading: "Giving",
    links: [
      { href: "/give", label: "Support Us" },
      { href: "/give?give=in-kind", label: "In-Kind Giving" },
    ],
  },
  {
    heading: "Church",
    links: [
      { href: "/beliefs", label: "What we believe" },
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
