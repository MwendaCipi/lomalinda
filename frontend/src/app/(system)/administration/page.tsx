"use client";

import Link from "next/link";
import { Armchair, BarChart3, Briefcase, Calendar, ChevronRight, ClipboardList, Crown, FileText, HandHelping, Heart, Images, Landmark, Mail, Megaphone, Package, Scale, Settings, ShieldCheck, UserCheck, UserPlus, Users, Wallet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { AnnouncementManager } from "@/components/announcement-manager";
import { EmailsDesk } from "@/components/emails-desk";
import { ChurchSettingsManager } from "@/components/church-settings-manager";
import { RoleRightsManager } from "@/components/role-rights-manager";
import { MeetingsManager } from "@/components/meetings-manager";
import { UserManagement } from "@/components/user-management";
import { CorrespondenceManager } from "@/components/correspondence-manager";
import { DepartmentAccountsPanel, DepartmentHub } from "@/components/department-hub";
import { AreaMomentsPanel } from "@/components/area-moments-panel";
import { TransferManagement } from "@/components/transfer-management";
import { RequestsAdminManager } from "@/components/requests-admin-manager";
import { usePendingRequestCounts } from "@/hooks/use-pending-request-counts";
import { TreasuryAccountsManager } from "@/components/treasury-accounts-manager";
import { TREASURY_VIEW_HREF, TreasuryNav } from "@/components/treasury-nav";
import { ChurchBudgetManager } from "@/components/church-budget-manager";
import { MpesaRefundManager } from "@/components/mpesa-refund-manager";
import { DeaconateManager } from "@/components/deaconate-manager";
import { DepartmentManager, DepartmentKey } from "@/components/department-manager";
import { SectionNav, SubNav } from "@/components/sub-nav";
import { usePageHeader } from "@/components/app-frame";
import { deaconateViews } from "@/config/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const ELDERSHIP_HEADING = {
  label: "Eldership",
  description: "The church's leadership, announcements, accounts and the requests members send.",
};

type StaffRole =
  | "admin"
  | "clerk"
  | "elder"
  | "pastor"
  | "youth_leader"
  | "choir_director"
  | "children_ministry"
  | "men_ministry"
  | "women_ministry"
  | "chaplaincy"
  | "welfare_leader"
  | "treasurer"
  | "member";

const officialRoles: StaffRole[] = [
  "admin",
  "clerk",
  "elder",
  "pastor",
  "youth_leader",
  "choir_director",
  "children_ministry",
  "men_ministry",
  "women_ministry",
  "chaplaincy",
  "welfare_leader",
  "treasurer",
];

type Transfer = {
  id: number;
  member_name: string;
  transfer_type: string;
  other_church: string;
};

/** Session cache of the gate result — the API still enforces every request. */
const ADMIN_GATE_KEY = "admin_gate_profile";

/**
 * What the workspace is about to show, named per section.
 *
 * The wait before a tab renders is time spent fetching that section, so the
 * screen says which one is loading rather than narrating a permissions check.
 */
const ADMIN_LOADING_LABELS: Record<string, string> = {
  users: "the member roster",
  leaders: "church departments",
  meetings: "meetings",
  board: "meetings",
  business: "meetings",
  announcements: "announcements",
  requests: "requests",
  transfers: "membership transfers",
  accounts: "treasury accounts",
  expenditures: "expenditure records",
  budget: "the church budget",
  refunds: "M-Pesa refunds",
  inventory: "the inventory register",
  "deaconate-rota": "the duty rota",
  "deaconate-moments": "the deaconate's moments",
  "deaconate-members": "the deaconate team",
  "deaconate-calendar": "the deaconate calendar",
  "deaconate-funding": "deaconate funding and accounts",
  "eldership-moments": "the eldership's moments",
  "eldership-funding": "eldership funding and accounts",
  "clerkship-funding": "clerkship funding and accounts",
  settings: "church settings",
  overview: "the overview",
};

function AdministrationContent() {
  const searchParams = useSearchParams();
  const searchTab = searchParams.get("tab");
  const searchView = searchParams.get("view");
  // The unanswered-request count, shared with the sidebar so the phone card
  // and the desktop rail can never disagree about the number.
  const pendingRequests = usePendingRequestCounts();
  // The request-notification emails land here: ?request=<kind>-<id> opens the
  // desk on that one request instead of every piece of unfinished business.
  const searchRequest = searchParams.get("request");
  // A department's own desk is a page of the hub — `?dept=children` opens it,
  // which is how the rail's Ministries and Departments rows link to one.
  const searchDept = searchParams.get("dept");

  const [status, setStatus] = useState<"loading" | "authorized" | "denied" | "offline">("loading");
  const [profile, setProfile] = useState<{ username: string; role: string; roles?: string[]; email?: string; is_staff?: boolean; is_superuser?: boolean; my_ties?: string[] } | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  // The desk the URL falls back to when it names no tab: the phone's overview,
  // or the desk the role keeps on a desktop. The URL itself is the tab.
  const [defaultTab, setDefaultTab] = useState<string>("users");

  const router = useRouter();

  /**
   * Ask the API who this browser is.
   *
   * Only an explicit 401/403 denies: a request that never arrived — the
   * browser offline, the network dropped, the server briefly down — is not a
   * lost session. Treating the two alike sent a signed-in member to /login on
   * a dead link, and the sign-in page would then validate the very same token
   * and bounce them straight back: the endless "Taking you in…" loop. A
   * member who already passed the gate keeps the session they were granted,
   * and one who has not is told the connection is down instead of being asked
   * for a password they already gave.
   */
  const checkAccess = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      setStatus("denied");
      return;
    }

    // This browser already passed the gate earlier in the session, so the
    // workspace paints at once instead of re-showing a wait screen on every
    // visit. The check below still runs and still decides: access is enforced
    // by the API, this only avoids asking the same question twice in a row.
    const cached = sessionStorage.getItem(ADMIN_GATE_KEY);
    if (cached) {
      try {
        const remembered = JSON.parse(cached);
        if (remembered && (remembered.role || remembered.roles?.length)) {
          setProfile(remembered);
          setStatus("authorized");
        }
      } catch {
        sessionStorage.removeItem(ADMIN_GATE_KEY);
      }
    }

    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      setStatus((current) => (current === "authorized" ? current : "offline"));
      return;
    }

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("access_token");
      sessionStorage.removeItem(ADMIN_GATE_KEY);
      setStatus("denied");
      return;
    }
    if (!response.ok) {
      // The server answered, but not with an identity — a 5xx, say. Keep the
      // session the cache granted and let the member retry.
      setStatus((current) => (current === "authorized" ? current : "offline"));
      return;
    }

    await response.json()
      .then((data) => {
        const rawRole = (data?.role || "").toLowerCase().trim();
        const userRoles: string[] = Array.isArray(data?.roles) && data.roles.length > 0 ? data.roles : [rawRole];
        // A member with no office still passes when they belong to a
        // department or ministry (or have asked to): the rail's area rows
        // open their desk here, read-mostly. The API still enforces every
        // write, so what they can change is decided server-side.
        const inArea =
          (data?.my_departments ?? []).some((row: { code?: string }) => row.code) ||
          (Array.isArray(data?.my_ties) && data.my_ties.length > 0);
        // Opening one area's page is everyone's door: the rail's area rows
        // land here read-mostly, whatever the viewer belongs to. The desks'
        // writes stay guarded server-side.
        const opensAnArea = Boolean(searchDept);
        const onDeaconate =
          (Array.isArray(data?.my_ties) && data.my_ties.includes("deaconate")) ||
          userRoles.some((r) => ["deacon", "deaconess", "head_deacon", "head_deaconess"].includes(r));
        const isOfficial =
          data &&
          (userRoles.some((r) => officialRoles.includes(r as StaffRole)) ||
            data.is_staff ||
            data.is_superuser ||
            rawRole === "admin" ||
            inArea ||
            opensAnArea ||
            onDeaconate);

        if (isOfficial) {
          setProfile(data);
          setStatus("authorized");
          sessionStorage.setItem(ADMIN_GATE_KEY, JSON.stringify(data));

          const effectiveRole = userRoles.find((r) => r !== "member") || (rawRole === "member" && (data.is_staff || data.is_superuser) ? "admin" : rawRole);
          if (["clerk", "elder", "admin"].includes(effectiveRole)) {
            fetch(`${API_URL}/api/members/transfers/`, { headers: { Authorization: `Bearer ${token}` } })
              .then((res) => (res.ok ? res.json() : []))
              .then((t) => setTransfers(t))
              .catch(() => {});
          }
        } else {
          sessionStorage.removeItem(ADMIN_GATE_KEY);
          setStatus("denied");
        }
      })
      .catch(() => setStatus((current) => (current === "authorized" ? current : "offline")));
  }, [searchDept]);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  // A dropped connection is not a lost session: when the browser reports it is
  // back, ask again rather than making the member reload the page by hand.
  useEffect(() => {
    const onOnline = () => {
      void checkAccess();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [checkAccess]);

  useEffect(() => {
    if (status === "denied") {
      router.replace("/login?next=/administration");
    }
  }, [router, status]);

  const baseRoles: string[] = Array.isArray(profile?.roles) && profile.roles.length > 0
    ? profile.roles
    : [(profile?.role || "").toLowerCase().trim() || "member"];
  // Staff and superusers hold admin power even when their profile role is
  // plain "member" — the same rule `isOfficial` above already uses for
  // letting them through the door, and the sidebar uses for its sections.
  const userRoles: string[] =
    profile && (profile.is_staff || profile.is_superuser) && !baseRoles.includes("admin")
      ? [...baseRoles, "admin"]
      : baseRoles;
  const hasAnyRole = (...codes: string[]) => userRoles.some((r) => codes.includes(r));
  const isAdmin = hasAnyRole("admin");
  const isClerk = hasAnyRole("clerk", "admin");
  const isElder = hasAnyRole("elder", "admin");
  // The pastor stands with the office on the Departments view.
  const isPastor = hasAnyRole("pastor");
  // Department leads whose desks receive request notices: they reach the
  // requests tab through the bell/email deep links, where their desks'
  // lists answer for them (the API returns only what they may see).
  const isRequestsDeskLead = hasAnyRole("pastor", "chaplaincy", "children_ministry", "welfare_leader", "admin");
  const isYouthLeader = hasAnyRole("youth_leader", "admin");
  const isChoirDirector = hasAnyRole("choir_director", "admin");
  const isFinance = hasAnyRole("treasurer", "elder", "admin");
  // The deaconate desk belongs to the deacons and the admin; elders and
  // clerks reach their work from the Elders' Desk. The roll counts too: a
  // deacon or deaconess seated on the deaconate keeps its rota and register
  // (the API's own rule, ``can_manage_deaconate``), so the duty reminder that
  // lands them here must find the page open.
  const onDeaconateRoll =
    Array.isArray(profile?.my_ties) && profile.my_ties.includes("deaconate");
  const isDeaconate =
    onDeaconateRoll ||
    hasAnyRole("deacon", "deaconess", "head_deacon", "head_deaconess", "admin");
  const isElderOnly = isElder && !isAdmin;
  // The phone overview is one page of desks, each with its own heading and a
  // card per page it holds — the same sections for every officer, so an admin
  // and a single-desk clerk read the same shape. A desk the officer does not
  // hold contributes nothing.
  const hasEldership = isElder || isClerk || isAdmin;
  const hasClerkship = isClerk;
  const hasTreasury = isFinance;
  const hasDeaconate = isDeaconate && !isElderOnly;
  // Every tab renders a full-height panel (table or cards) that scrolls
  // internally, so the workspace never scrolls the page itself. "overview"
  // is the mobile card grid and keeps normal scrolling.
  /**
   * The open desk is whatever the address bar names. A console page is one
   * route (`/administration`) whose `?tab=` picks the page, so reading it off
   * the URL shows the right page on the click that asked for it — syncing it
   * through state a render later showed the previous page first, and only
   * settled on a second press. The overview's cards write the address bar the
   * same way, through a plain link.
   */
  // Two tabs no longer name a desk of their own: an expenditure lives in
  // the accounts tab, and the old role-management links land on the register
  // — roles are hardcoded, and user management edits who holds them.
  const activeTab = searchTab
    ? searchTab === "expenditures"
      ? "accounts"
      : searchTab === "transfers"
        ? "clerk-requests"
      : searchTab === "role-management"
        ? "users"
        : searchTab
    : defaultTab;

  const tableContainedTabs = ["users", "leaders", "leadership", "accounts", "expenditures", "budget", "refunds", "announcements", "requests", "clerk-requests", "correspondence", "meetings", "board", "business", "deaconate-rota", "deaconate-moments", "deaconate-members", "deaconate-calendar", "deaconate-funding", "eldership-moments", "eldership-funding", "clerkship-funding", "inventory", "settings", "join-requests", "emails"];

  /**
   * Meetings — church board and business meetings are consolidated into a single
   * desk under Clerkship (`?tab=meetings`). `?tab=board` and `?tab=business`
   * alias to this desk with the corresponding filter pre-selected.
   */
  const meetingTab = activeTab === "meetings" || activeTab === "board" || activeTab === "business";

  // The fallback desk, chosen once the role is known. A URL tab always
  // outranks it (see `activeTab` above), so this never delays a toggle.
  useEffect(() => {
    if (searchTab) return;
    // A bare /administration — the account menu's only door to the console —
    // lands on a real desk, never the overview of cards: on a phone that is
    // the register itself, so the console opens where the work is.
    const onDesk = typeof window !== "undefined" && window.innerWidth >= 1024;
    // The treasury is the exception to the desk a hand opens on. Its first
    // toggle — Individual Givings — is the contributions ledger, a page of its
    // own rather than a tab of this console, so a treasurer opening the console
    // in a hand is sent to the ledger: the treasury's strip then opens with the
    // toggle that names their work underscored, instead of the accounts desk
    // where Church Accounts, the fourth, would be the one lit.
    // If the user also holds elder/clerk/admin office, prioritize the administrative
    // desks rather than forcing them to the treasury ledger on mobile.
    const isDedicatedTreasurer = userRoles.includes("treasurer") && !isClerk && !isElder && !isAdmin;
    const opensTreasuryLedger = !onDesk && isDedicatedTreasurer;
    // Whoever lands on the console proper opens on its **first** toggle —
    // User Management — so the desk never opens on a page further down the
    // strip than where it begins. The two branches that name another desk's
    // own page (the eldership's announcements, the treasury's accounts) stay
    // as they are: those desks draw their own strip, and its first toggle is
    // theirs to choose.
    const fallback = opensTreasuryLedger
      ? "treasury"
      : onDesk
        ? isClerk
          ? "users"
          : isElder
            ? "announcements"
            : isFinance
              ? "accounts"
              : "users"
        : isClerk || isElder || isAdmin
          ? "users"
          : isDedicatedTreasurer
            ? "treasury"
            : "users";
    // Until the gate answers, the hand reads the overview's cards — the landing
    // a phone gets — and the ledger under it takes over once access is granted.
    setDefaultTab(fallback === "treasury" ? "overview" : fallback);
    // The desk is written into the URL on every screen now, so a reload, a
    // shared link and the page heading all agree on the page without a
    // second read of the role.
    if (status === "authorized") {
      router.replace(
        fallback === "treasury" ? "/administration/treasury" : `/administration?tab=${fallback}`,
        { scroll: false }
      );
    }
  }, [searchTab, isClerk, isElder, isAdmin, isFinance, userRoles, status, router]);

  // The console's own two pages — the register and the church's settings —
  // no longer hang on a rail row (the account menu is the console's only
  // door), so they would otherwise draw no strip above the desk. Give them
  // one here, the same way every other desk's rail section does, so opening
  // Administration from the account menu still meets a row of toggles to move
  // between the two. Desks that own their own strip (treasury, deaconate,
  const { setCustomToggles, setCustomHeader, setHeadingFirst } = usePageHeader();
  const deaconateTab = deaconateViews.some((page) => page.tab === activeTab);
  useEffect(() => {
    if (!deaconateTab) return;
    // These six pages share the Deaconate desk. Give the desk its strip
    // directly, rather than relying on the rail's query reader to catch up:
    // on a wide screen that reader could still be on the previous console tab
    // and leave the desktop with no navigation while the phone had already
    // drawn its own layout.
    setCustomToggles(
      <SectionNav
        label="Deaconate pages"
        activeHref={`/administration?tab=${activeTab}`}
        items={deaconateViews.map((page) => ({
          key: page.tab,
          href: `/administration?tab=${page.tab}`,
          label: page.label,
          short: page.short,
          icon: page.icon,
          help: page.description,
        }))}
      />
    );
    return () => setCustomToggles(null);
  }, [activeTab, deaconateTab, setCustomToggles]);
  // The budget is another view of the treasury's money, so it draws the
  // treasury's own strip — the same one the ledger, the accounts desk and the
  // drives page draw. Without this it fell back to the rail's older list of
  // treasury pages, and the desk changed its toggles as the reader moved from
  // the ledger to the budget. The retired `refunds` desk still draws it too:
  // the link is kept alive so a refund already in flight can be watched, but
  // the strip no longer offers a Refunds toggle, so it underlines Givings.
  const treasuryTab = activeTab === "budget" || activeTab === "refunds";
  useEffect(() => {
    if (!treasuryTab || !isFinance) return;
    setCustomToggles(
      <TreasuryNav
        active={activeTab === "budget" ? "budget" : "givings"}
        onSelect={(next) => router.replace(TREASURY_VIEW_HREF[next])}
      />
    );
    return () => setCustomToggles(null);
  }, [activeTab, treasuryTab, isFinance, setCustomToggles, router]);
  // The console's own pages draw the Administration strip.
  const consoleTab =
    activeTab === "users" ||
    activeTab === "roles" ||
    activeTab === "leadership" ||
    activeTab === "settings" ||
    activeTab === "join-requests";
  // Who the toggle is for: the same people the requests desk already admits,
  // because the API behind it answers to those roles and the notices for a
  // join ask name them. The card on the phone overview sits with the console's
  // own pages, under the office's wider gate.
  const canAnswerJoins = isClerk || isElder || isAdmin || isRequestsDeskLead;
  useEffect(() => {
    if (!consoleTab) return;
    // These are Administration's own pages, so name the console before its
    // page toggles on a phone instead of making the current toggle's label
    // carry the heading.
    setCustomHeader({ label: "Administration" });
    setHeadingFirst(true);
    setCustomToggles(
      <SectionNav
        label="Administration pages"
        activeHref={`/administration?tab=${activeTab}`}
        items={[
          {
            key: "users",
            href: "/administration?tab=users",
            label: "User Management",
            short: "Users",
            help: "The church register.",
          },
          {
            key: "roles",
            href: "/administration?tab=roles",
            label: "Role Management",
            short: "Roles",
            help: "Church-wide role permissions.",
          },
          {
            key: "leadership",
            href: "/administration?tab=leadership",
            label: "Church Leadership",
            short: "Leadership",
            help: "The church's offices, ministries and departments, with each leader and assistant.",
          },
          {
            key: "settings",
            href: "/administration?tab=settings",
            label: "Church Settings",
            short: "Settings",
            help: "The church's name, channels, meeting times and public record.",
          },
          // The office's answer to a join ask is a toggle of the console's
          // own — it is not a desk of any rail section — so it rides the same
          // strip as the register and the settings, where whoever holds the
          // console can find it without hunting a queue for it.
          ...(canAnswerJoins
            ? [
                {
                  key: "join-requests",
                  href: "/administration?tab=join-requests",
                  label: "Join Requests",
                  short: "Join",
                  help: "New members, ministry asks and membership transfers waiting on an answer.",
                },
              ]
            : []),
        ]}
      />
    );
    return () => {
      setCustomToggles(null);
      setCustomHeader(null);
      setHeadingFirst(false);
    };
  }, [activeTab, consoleTab, canAnswerJoins, setCustomToggles, setCustomHeader, setHeadingFirst]);

  // The phone's overview, grouped by desk: each desk is a heading with a card
  // per page it holds. The desktop rail already names these places, which is
  // why the whole page is hidden from `lg`.
  const overviewDesks: OverviewDesk[] = (
    [
    // Administration — the console's own pages: church-wide roles and settings.
    isClerk || isElder || isAdmin
      ? {
          label: "Administration",
          icon: <ShieldCheck size={16} aria-hidden="true" />,
          description: "Church-wide role permissions and church settings.",
          cards: [
            { icon: <Users size={20} aria-hidden="true" />, label: "User Management", description: "The church register: users, profiles and their assigned roles.", href: "/administration?tab=users" },
            { icon: <ShieldCheck size={20} aria-hidden="true" />, label: "Roles", description: "Set the permissions each church-wide role holds.", href: "/administration?tab=roles" },
            { icon: <Crown size={20} aria-hidden="true" />, label: "Church Leadership", description: "The church's offices, ministries and departments, with each leader and assistant.", href: "/administration?tab=leadership" },
            { icon: <Settings size={20} aria-hidden="true" />, label: "Church Settings", description: "The church's name, channels, meeting times and public record.", href: "/administration?tab=settings" },
            ...(canAnswerJoins
              ? [{ icon: <UserPlus size={20} aria-hidden="true" />, label: "Join Requests", description: "Approve new members, ministry asks and membership transfers.", href: "/administration?tab=join-requests", badge: pendingRequests.joins + pendingRequests.ministry + pendingRequests.transfers }]
              : []),
          ],
        }
      : null,
    hasClerkship
      ? {
          label: "Clerkship",
          icon: <ClipboardList size={16} aria-hidden="true" />,
          description: "Join requests, meetings' minutes, letters, messages and church funds.",
          cards: [
            { icon: <UserPlus size={20} aria-hidden="true" />, label: "Requests", description: "New members, ministry joins and membership transfers waiting on an answer.", href: "/administration?tab=clerk-requests", badge: pendingRequests.joins + pendingRequests.ministry + pendingRequests.transfers },
            { icon: <FileText size={20} aria-hidden="true" />, label: "Correspondences", description: "Write, share and print the church's official correspondence.", href: "/administration?tab=correspondence" },
            { icon: <Mail size={20} aria-hidden="true" />, label: "Messaging", description: "Letters arriving at info@sdalomalinda.or.ke, and the messages the church sends.", href: "/administration?tab=emails" },
            { icon: <Calendar size={20} aria-hidden="true" />, label: "Meetings", description: "The board and business meetings, agendas, files and minutes.", href: "/administration?tab=meetings" },
            { icon: <Wallet size={20} aria-hidden="true" />, label: "Funding & Accounts", description: "The church funds the clerk keeps the books for.", href: "/administration?tab=clerkship-funding" },
          ],
        }
      : null,
    hasEldership
      ? {
          label: "Eldership",
          icon: <Armchair size={16} aria-hidden="true" />,
          description: "The church's leadership, announcements, accounts and the requests members send.",
          cards: [
            { icon: <Crown size={20} aria-hidden="true" />, label: "Church Leadership", description: "The church's offices, ministries and departments, with each leader and assistant.", href: "/administration?tab=leaders" },
            { icon: <Megaphone size={20} aria-hidden="true" />, label: "Announcements", description: "Publish Sabbath & weekly public announcements and track pledges.", href: "/administration?tab=announcements" },
            { icon: <HandHelping size={20} aria-hidden="true" />, label: "Received Requests", description: "Review join, prayer, visitation, dedication, and support requests.", href: "/administration?tab=requests", badge: pendingRequests.total },
            { icon: <Images size={20} aria-hidden="true" />, label: "Moments", description: "Document a moment — pictures and video links of the church's days.", href: "/administration?tab=eldership-moments" },
            { icon: <Wallet size={20} aria-hidden="true" />, label: "Funding & Accounts", description: "The church's treasury accounts.", href: "/administration?tab=eldership-funding" },
          ],
        }
      : null,
    hasTreasury
      ? {
          label: "Treasury & Finance",
          icon: <Landmark size={16} aria-hidden="true" />,
          description: "Accounts, ledger, fund drives and the year's budget.",
          cards: [
            { icon: <Scale size={20} aria-hidden="true" />, label: "Contributions Ledger", description: "Record cash receipts and track all giving breakdown ledgers.", href: "/administration/treasury" },
            { icon: <Landmark size={20} aria-hidden="true" />, label: "Church Accounts", description: "Set up church accounts, watch balances, track income and spending, and promote an account into a fund drive.", href: "/administration?tab=accounts" },
            { icon: <Heart size={20} aria-hidden="true" />, label: "Fund Drives", description: "Manage the church's fund drives.", href: "/administration/fund-drives" },
            { icon: <BarChart3 size={20} aria-hidden="true" />, label: "Church Budget", description: "Post the year's plan and publish it to the congregation.", href: "/administration?tab=budget" },
          ],
        }
      : null,
    hasDeaconate
      ? {
          label: "Deaconate Ministry",
          icon: <Package size={16} aria-hidden="true" />,
          description: "Church property, the duty rota, the team and the ordinances calendar.",
          // One card per page the desk holds, the same shape every other desk
          // reads on a phone: the team, the property register, the rota, the
          // ordinances and the desk's accounts. A single card for the whole
          // ministry left the rota and the register with no door of their own
          // — the rail names them on a wide screen, and a phone has no rail.
          cards: [
            { icon: <UserCheck size={20} aria-hidden="true" />, label: "Deaconate Team", description: "The deacons and deaconesses who serve the church's property, duty and ordinances.", href: "/administration?tab=deaconate-members" },
            { icon: <Package size={20} aria-hidden="true" />, label: "Church Property", description: "The church's property register, and the movements of each item.", href: "/administration?tab=inventory" },
            { icon: <ClipboardList size={20} aria-hidden="true" />, label: "Duty Rota", description: "The deacons' and deaconesses' duty rosters for the church's services.", href: "/administration?tab=deaconate-rota" },
            { icon: <Images size={20} aria-hidden="true" />, label: "Moments", description: "Document a moment — pictures and video links of the church's days.", href: "/administration?tab=deaconate-moments" },
            { icon: <Calendar size={20} aria-hidden="true" />, label: "Deaconate Calendar", description: "Communion services, foot washing and the ordinances the desk keeps.", href: "/administration?tab=deaconate-calendar" },
            { icon: <Wallet size={20} aria-hidden="true" />, label: "Funding & Accounts", description: "The funds the deaconate's work is answered for.", href: "/administration?tab=deaconate-funding" },
          ],
        }
      : null,
    ] as (OverviewDesk | null)[]
  ).filter((desk): desk is OverviewDesk => desk !== null);

  if (status === "loading") {
    return (
      <main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">
        Loading {ADMIN_LOADING_LABELS[searchTab ?? ""] ?? "the administration workspace"}...
      </main>
    );
  }

  if (status === "denied") return null;

  // Offline (or the server unreachable) with no session cached: say so rather
  // than asking for a password over a dead link.
  if (status === "offline") {
    return (
      <main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">
        <p className="text-sm font-semibold text-bark">You&apos;re offline</p>
        <p className="mx-auto mt-1 max-w-sm text-xs">
          The workspace needs the church&apos;s server. Nothing is lost. It opens again the moment the connection is back.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("loading");
            void checkAccess();
          }}
          className="mt-4 rounded-xl bg-bark px-4 py-2 text-xs font-semibold text-white transition hover:bg-bark-900"
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen md:h-full bg-sand text-bark md:overflow-hidden">
      <div className="flex h-full md:h-full md:overflow-hidden">
        {/* MAIN WORKSPACE CONTENT */}
        <div className="flex-1 min-w-0 h-full p-0 flex flex-col overflow-hidden">
          <div className="w-full h-full flex flex-col bg-white border-l border-sand-line overflow-hidden">
            <div
              className={`flex-1 min-h-0 ${
                tableContainedTabs.includes(activeTab)
                  ? "flex h-full flex-col p-0 overflow-hidden"
                  : "p-4 sm:p-6 overflow-y-auto custom-hover-scrollbar md:overflow-y-auto"
              }`}
            >

            {/* Overview — the phone's card grid, grouped by desk so the
                sections read the same for an admin and a single-desk clerk. */}
            {activeTab === "overview" && (
              <div className="space-y-8 p-4 sm:p-6 lg:hidden">
                {overviewDesks.map((desk) => (
                  <section key={desk.label} className="space-y-3">
                    <DeskHeading icon={desk.icon} label={desk.label} description={desk.description} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      {desk.cards.map((card) => (
                        <OverviewCard key={card.href} {...card} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* Church Clerk Approval Notice */}
            {["users", "leaders", "meetings", "board", "business", "announcements", "requests", "transfers", "clerkship-funding", "settings"].includes(activeTab) && isClerk && !isElder && !isAdmin && (
              <div className="mb-4 rounded-xl border border-gold-sand bg-sand-mist p-3.5 text-xs font-medium text-ember-soft shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold">Church Clerk Access:</span>
                  <span>You have rights to access and prepare updates across Clerkship and Eldership. Actions require Elder approval to persist.</span>
                </div>
                <span className="shrink-0 rounded-md bg-gold-sand px-2 py-0.5 text-[10px] font-bold text-gold-brown">Requires Elder Approval</span>
              </div>
            )}

            {/* Users (Members) View */}
            {activeTab === "users" && (isClerk || isElder || isAdmin) && <UserManagement />}

            {activeTab === "roles" && (isAdmin || isClerk || isElder) && (
              <div className="h-full min-h-0 overflow-y-auto custom-hover-scrollbar">
                <RoleRightsManager />
              </div>
            )}

            {/* Leadership — the directory of the church's areas, opened on
                one of them when a rail row (or a link) names it. The API
                decides who may edit; the page itself is open to every office. */}
            {activeTab === "leaders" && <DepartmentHub key={searchDept ?? "directory"} initialDept={searchDept} directoryHeading={ELDERSHIP_HEADING} />}

            {activeTab === "leadership" && (isClerk || isElder || isAdmin) && (
              <DepartmentHub
                key={`shared-${searchDept ?? "directory"}`}
                initialDept={searchDept}
                // A duty notice links to the desk view that holds the line it
                // is about — the pulpit team's own — while every other use of
                // ?view= (the treasury's) leaves the hub on its roll.
                initialTab={searchView === "pulpit-team" ? "pulpit-team" : undefined}
                directoryHeading={{ label: "Administration", description: "The church's offices, ministries and departments, with each leader and assistant." }}
              />
            )}

            {/* Church Meetings — board and business meetings consolidated */}
            {meetingTab && (isClerk || isElder || isAdmin) && (
              <div className="h-full min-h-0 overflow-y-auto custom-hover-scrollbar">
                <div className="p-4 sm:p-6 lg:p-8">
                  <MeetingsManager
                    initialKindFilter={
                      activeTab === "business" ? "business" : activeTab === "board" ? "board" : "all"
                    }
                  />
                </div>
              </div>
            )}

            {/* Announcements Manager */}
            {activeTab === "announcements" && (isClerk || isElder || isAdmin) && (
              <div className="h-full min-h-0">
                <AnnouncementManager />
              </div>
            )}

            {/* Messaging — the church's own mailbox at info@, now a page of
                the clerk's strip since the clerk is who writes to the church.
                Announcements are what the office says to everyone; this is
                what arrived for somebody to answer. The API decides who may
                read it; the page simply gives it the full height, since it
                scrolls itself. */}
            {activeTab === "emails" && (isClerk || isElder || isAdmin) && (
              <div className="h-full min-h-0">
                <EmailsDesk />
              </div>
            )}

            {/* Received Requests Manager (including Transfers) — the manager
                owns its own scrolling: toolbar pinned, table scrolls. */}
            {(activeTab === "requests" || activeTab === "clerk-requests") && (isClerk || isElder || isAdmin || isRequestsDeskLead) && (
              <div className="h-full min-h-0">
                <RequestsAdminManager
                  initialTab={activeTab === "clerk-requests" ? "clerk" : "all"}
                  focusRequest={searchRequest}
                />
              </div>
            )}

            {activeTab === "correspondence" && isClerk && <CorrespondenceManager />}

            {/* Join Requests — the console's own door on both kinds of join
                ask: a new member whose account waits on approval, and a
                member asking to join a ministry. One queue, because the
                office answers "may this person join" either way. */}
            {activeTab === "join-requests" && canAnswerJoins && (
              <div className="h-full min-h-0">
                <RequestsAdminManager initialTab="joins" focusRequest={searchRequest} />
              </div>
            )}

            {/* Treasury Accounts Manager */}
            {activeTab === "accounts" && isFinance && (
              <div className="h-full min-h-0">
                <TreasuryAccountsManager
                  initialView={
                    (searchView as "accounts" | "expenditure" | "withdrawals") ||
                    (searchTab === "expenditures" ? "expenditure" : undefined)
                  }
                />
              </div>
            )}

            {/* Church Budget Manager — the treasurer posts the year's plan
                and decides when the congregation sees it. */}
            {activeTab === "budget" && isFinance && (
              <div className="h-full min-h-0">
                <ChurchBudgetManager />
              </div>
            )}

            {/* M-Pesa Refund Manager */}
            {activeTab === "refunds" && isFinance && (
              <div className="h-full min-h-0">
                <MpesaRefundManager />
              </div>
            )}

            {/* Church Settings Manager */}
            {activeTab === "settings" && (isAdmin || isClerk || isElder) && (
              <div className="h-full min-h-0 overflow-y-auto custom-hover-scrollbar">
                <ChurchSettingsManager />
              </div>
            )}

            {/* Deaconate Ministry Manager */}
            {["inventory", "deaconate-rota", "deaconate-moments", "deaconate-members", "deaconate-calendar", "deaconate-funding"].includes(activeTab) && (
              // The deaconate panels own their own scrolling (fixed filters, scrolling
              // rows, fixed actions), so the page itself must not scroll.
              <div className="h-full min-h-0">
                <DeaconateManager
                  initialTab={
                    activeTab === "deaconate-rota"
                      ? "rota"
                      : activeTab === "deaconate-moments"
                      ? "moments"
                      : activeTab === "deaconate-members"
                      ? "members"
                      : activeTab === "deaconate-calendar"
                      ? "calendar"
                      : activeTab === "deaconate-funding"
                      ? "funding"
                      : "inventory"
                  }
                />
              </div>
            )}

            {/* Eldership Moments */}
            {activeTab === "eldership-moments" && (isElder || isClerk || isAdmin) && (
              <div className="h-full min-h-0">
                <AreaMomentsPanel
                  departmentLabel="Eldership"
                  canManage={Boolean(isAdmin || profile?.is_staff || profile?.is_superuser)}
                />
              </div>
            )}

            {/* Eldership Funding & Accounts — the elders answer for the
                church's money: the desk reads every treasury account, LCB
                and Msamaria Mwema among them, with the movements on each. */}
            {activeTab === "eldership-funding" && (isElder || isClerk || isAdmin) && (
              <div className="h-full min-h-0">
                <DepartmentAccountsPanel
                  department={{ code: "eldership", label: "Eldership" }}
                  onChanged={() => {}}
                  search=""
                />
              </div>
            )}

            {/* Clerkship Funding & Accounts — the clerk keeps the church's own
                books: the desk reads the church budget with the two funds the
                welfare and outreach sit in, and the movements on each. */}
            {activeTab === "clerkship-funding" && isClerk && (
              <div className="h-full min-h-0">
                <DepartmentAccountsPanel
                  department={{ code: "clerkship", label: "Clerkship" }}
                  onChanged={() => {}}
                  search=""
                />
              </div>
            )}

            {/* Department Manager (AMM, AWM, AYM, APM, Chaplaincy) */}
            {activeTab.startsWith("dept-") && (
              <div className="h-full min-h-0 overflow-y-auto custom-hover-scrollbar">
                <DepartmentManager
                  deptKey={activeTab.replace("dept-", "").replace(/-(members|calendar|activities)$/, "") as DepartmentKey}
                  initialSubTab={(activeTab.match(/-(members|calendar|activities)$/)?.[1] as "members" | "calendar" | "activities") || "members"}
                />
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** One page of a desk in the phone overview. */
type OverviewCardDef = {
  icon: ReactNode;
  label: string;
  description: string;
  href: string;
  /** A count to show beside the label — only when there is one. */
  badge?: number;
};

/** One desk of the phone overview: a heading and the pages it holds. */
type OverviewDesk = {
  label: string;
  icon: ReactNode;
  description: string;
  cards: OverviewCardDef[];
};

/** The heading above a desk's cards in the phone overview. */
function DeskHeading({ icon, label, description }: { icon: ReactNode; label: string; description: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sand text-ember" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-bark">{label}</h2>
        <p className="text-xs leading-5 text-moss">{description}</p>
      </div>
    </div>
  );
}

/** One page of a desk in the phone overview. A real link, so the whole card is
    keyboard-reachable and every card navigates the same way. */
function OverviewCard({ icon, label, description, href, badge }: OverviewCardDef) {
  return (
    <Link
      href={href}
      replace
      scroll={false}
      className="group flex items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="block text-sm font-bold text-bark">{label}</span>
          {badge ? (
            <span
              title={`${badge} request${badge === 1 ? "" : "s"} awaiting review`}
              className="rounded-full bg-ember px-1.5 py-0.5 text-[10px] font-bold text-white"
            >
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-moss">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
    </Link>
  );
}

export default function AdministrationPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">
          Loading Leader Portal...
        </main>
      }
    >
      <AdministrationContent />
    </Suspense>
  );
}
