"use client";

import Link from "next/link";
import { Armchair, BarChart3, Briefcase, ChevronRight, ClipboardList, Crown, HandHelping, Handshake, Heart, Landmark, Megaphone, Package, Receipt, Scale, Settings, Undo2, Users } from "lucide-react";
import { BackToOverviewArrow } from "@/components/back-to-overview-arrow";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { AnnouncementManager } from "@/components/announcement-manager";
import { ChurchSettingsManager } from "@/components/church-settings-manager";
import { BusinessMeetingManager } from "@/components/business-meeting-manager";
import { BoardMeetingManager } from "@/components/board-meeting-manager";
import { UserManagement } from "@/components/user-management";
import { DepartmentHub } from "@/components/department-hub";
import { TransferManagement } from "@/components/transfer-management";
import { RequestsAdminManager } from "@/components/requests-admin-manager";
import { usePendingRequestCounts } from "@/hooks/use-pending-request-counts";
import { TreasuryAccountsManager } from "@/components/treasury-accounts-manager";
import { ChurchBudgetManager } from "@/components/church-budget-manager";
import { ExpenditureManager } from "@/components/expenditure-manager";
import { MpesaRefundManager } from "@/components/mpesa-refund-manager";
import { DeaconateManager } from "@/components/deaconate-manager";
import { DepartmentManager, DepartmentKey } from "@/components/department-manager";
import { SubNav } from "@/components/sub-nav";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

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

/** The two kinds of meeting the Elders' Desk keeps the minutes for. */
type MeetingKind = "board" | "business";

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
  "deaconate-members": "the deaconate team",
  "deaconate-calendar": "the deaconate calendar",
  settings: "church settings",
  overview: "the overview",
};

function AdministrationContent() {
  const searchParams = useSearchParams();
  const searchTab = searchParams.get("tab");
  // The unanswered-request count, shared with the sidebar so the phone card
  // and the desktop rail can never disagree about the number.
  const pendingRequests = usePendingRequestCounts();
  // The request-notification emails land here: ?request=<kind>-<id> opens the
  // desk on that one request instead of every piece of unfinished business.
  const searchRequest = searchParams.get("request");
  // A department's own desk is a page of the hub — `?dept=children` opens it,
  // which is how the rail's Ministries and Departments rows link to one.
  const searchDept = searchParams.get("dept");

  const [status, setStatus] = useState<"loading" | "authorized" | "denied">("loading");
  const [profile, setProfile] = useState<{ username: string; role: string; roles?: string[]; email?: string; is_staff?: boolean; is_superuser?: boolean } | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [activeTab, setActiveTab] = useState<string>("overview");

  const router = useRouter();

  useEffect(() => {
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

    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            localStorage.removeItem("access_token");
          }
          throw new Error("Unauthorized");
        }
        return response.json();
      })
      .then((data) => {
        const rawRole = (data?.role || "").toLowerCase().trim();
        const userRoles: string[] = Array.isArray(data?.roles) && data.roles.length > 0 ? data.roles : [rawRole];
        const isOfficial =
          data &&
          (userRoles.some((r) => officialRoles.includes(r as StaffRole)) ||
            data.is_staff ||
            data.is_superuser ||
            rawRole === "admin");

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
      .catch(() => setStatus("denied"));
  }, []);

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
  const isFinance = hasAnyRole("treasurer", "admin");
  // The deaconate desk belongs to the deacons and the admin; elders and
  // clerks reach their work from the Elders' Desk.
  const isDeaconate = hasAnyRole("deacon", "deaconess", "head_deacon", "head_deaconess", "admin");
  const isElderOnly = isElder && !isAdmin;
  // Mobile overview: an office spanning more than one role — and the admin,
  // who spans all of them — lands on the sidebar's section headings and drills
  // in; a single-role desk opens its items directly.
  const useSectionCards = isAdmin || userRoles.filter((r) => r !== "member").length > 1;
  // Which section's cards the phone overview is showing (null = the headings).
  const [overviewSection, setOverviewSection] = useState<"elders" | "finance" | "deaconate" | null>(null);
  // Four desks, each with its own work: the elders' programmes, the clerk's
  // register, the treasury's money and the deaconate's property. An officer
  // sees the desks they hold; an admin, who holds them all, drills in.
  // Eldership is one desk: elders and clerks saw the same items across two
  // rows, so the phone's section and the cards carry the merged set.
  const showEldersItems = (isElder || isClerk || isAdmin) && (!useSectionCards || overviewSection === "elders");
  const showFinanceItems = isFinance && (!useSectionCards || overviewSection === "finance");
  const showDeaconateItems = isDeaconate && !isElderOnly && (!useSectionCards || overviewSection === "deaconate");
  // Every tab renders a full-height panel (table or cards) that scrolls
  // internally, so the workspace never scrolls the page itself. "overview"
  // is the mobile card grid and keeps normal scrolling.
  const tableContainedTabs = ["users", "leaders", "accounts", "expenditures", "budget", "refunds", "announcements", "requests", "transfers", "meetings", "board", "business", "deaconate-rota", "deaconate-members", "deaconate-calendar", "inventory", "settings"];

  /**
   * Meetings — board and business are rows of the Elders' Desk submenu, so
   * the kind is the tab itself: `?tab=board` and `?tab=business` each open
   * their own list, and an old `?tab=meetings` link still lands on board.
   */
  const meetingTab = activeTab === "meetings" || activeTab === "board" || activeTab === "business";
  const meetingKind: MeetingKind = activeTab === "business" ? "business" : "board";

  // Synchronize active tab safely without infinite loop
  useEffect(() => {
    if (searchTab) {
      setActiveTab(searchTab);
    } else if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      const defaultTab = isClerk ? "users" : isElder ? "announcements" : isFinance ? "accounts" : "settings";
      setActiveTab(defaultTab);
    } else {
      setActiveTab("overview");
    }
  }, [searchTab, isClerk, isElder, isFinance]);

  if (status === "loading") {
    return (
      <main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">
        Loading {ADMIN_LOADING_LABELS[searchTab ?? ""] ?? "the administration workspace"}...
      </main>
    );
  }

  if (status === "denied") return null;

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

            {/* Overview / Card Grid View (Mobile Only) */}
            {activeTab === "overview" && (
              <div className="space-y-6 p-4 sm:p-6 lg:hidden">
                {useSectionCards && overviewSection === null ? (
                  /* The section headings, one card each — the phone's front
                     page of the sidebar. */
                  <div className="grid gap-5 sm:grid-cols-2">
                    {(isElder || isClerk || isAdmin) && (
                      <SectionHeadingCard
                        icon={<Armchair size={18} aria-hidden="true" />}
                        label="Eldership"
                        description="The register, transfers, settings, meetings, announcements and requests."
                        onClick={() => setOverviewSection("elders")}
                      />
                    )}
                    {(isElder || isClerk) && (
                      <SectionHeadingCard
                        icon={<Crown size={18} aria-hidden="true" />}
                        label="Leadership"
                        description="Every ministry and department's leadership, roll and calendar, in one place."
                        onClick={() => {
                          setActiveTab("leaders");
                          router.replace("/administration?tab=leaders", { scroll: false });
                        }}
                      />
                    )}
                    {isFinance && (
                      <SectionHeadingCard
                        icon={<Landmark size={18} aria-hidden="true" />}
                        label="Treasury & Finance"
                        description="Accounts, ledger, fund drives, expenditure and refunds."
                        onClick={() => setOverviewSection("finance")}
                      />
                    )}
                    {isDeaconate && !isElderOnly && (
                      <SectionHeadingCard
                        icon={<Package size={18} aria-hidden="true" />}
                        label="Deaconate Ministry"
                        description="Inventory, duty rota, team and ordinances calendar."
                        onClick={() => setOverviewSection("deaconate")}
                      />
                    )}
                  </div>
                ) : (
                <>
                {useSectionCards && (
                  <button
                    type="button"
                    onClick={() => setOverviewSection(null)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-sand-mute bg-white px-4 py-2 text-xs font-semibold text-bark transition hover:border-ember"
                  >
                    &larr; All sections
                  </button>
                )}
                <div className="grid gap-5 sm:grid-cols-2">
                  {showEldersItems && (
                    <>
                      {/* One desk's cards in the strip's order — elders and
                          clerks share every row of Eldership. */}
                      <div
                        onClick={() => {
                          setActiveTab("users");
                          router.replace("/administration?tab=users", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Users size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">User Management</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">The church register: every member, their roles and their details.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("leaders");
                          setOverviewSection(null);
                          router.replace("/administration?tab=leaders", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Crown size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">Leadership</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">Every ministry and department&apos;s leadership, roll and calendar, in one place.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("board");
                          router.replace("/administration?tab=board", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Armchair size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">Board Meetings</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">The board&apos;s schedules, agendas, files and minutes.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("business");
                          router.replace("/administration?tab=business", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Briefcase size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">Business Meetings</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">The congregation in session: agendas, files and minutes.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("transfers");
                          router.replace("/administration?tab=transfers", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><ClipboardList size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">Membership Transfers</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">Process incoming & outgoing church membership transfer requests.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("settings");
                          router.replace("/administration?tab=settings", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Settings size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">Church Settings</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">The church&apos;s name, channels, meeting times and public record.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                      </div>
                    </>
                  )}

                  {showEldersItems && (
                    <div
                      onClick={() => {
                        setActiveTab("announcements");
                        router.replace("/administration?tab=announcements", { scroll: false });
                      }}
                      className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Megaphone size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">Announcements</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">Publish Sabbath & weekly public announcements and track pledges.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                    </div>
                  )}

                  {showEldersItems && (
                    <div
                      onClick={() => {
                        setActiveTab("requests");
                        router.replace("/administration?tab=requests", { scroll: false });
                      }}
                      className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><HandHelping size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="block text-sm font-bold text-bark">Received Requests</span>
                            {/* The phone hub is where a leader lands, so the count of
                                unanswered requests travels with the card. */}
                            {pendingRequests.total > 0 && (
                              <span
                                title={`${pendingRequests.total} request${pendingRequests.total === 1 ? "" : "s"} awaiting review`}
                                className="rounded-full bg-ember px-1.5 py-0.5 text-[10px] font-bold text-white"
                              >
                                {pendingRequests.total}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">Review join, prayer, visitation, dedication, and support requests.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                    </div>
                  )}

                  {showFinanceItems && (
                    <>
                      {/* The desk's order mirrors the strip: Ledger, Accounts,
                          Expenditure, Drives, Budget, Refunds. */}
                      <Link
                        href="/administration/reconciliation"
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Scale size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">Ledger</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">Record cash receipts and track all giving breakdown ledgers.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                      </Link>

                      {/* The finances' own desk. It was only reachable from the
                          desktop sidebar, so a treasurer on a phone had no card
                          for the accounts they open most. */}
                      <div
                        onClick={() => {
                          setActiveTab("accounts");
                          router.replace("/administration?tab=accounts", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Landmark size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">Treasury Accounts</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">Set up church accounts, watch balances, and promote an account into a fund drive.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("expenditures");
                          router.replace("/administration?tab=expenditures", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Receipt size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">Expenditure</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">Record what the church spends, per account, and keep the books balanced.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                      </div>

                      <Link
                        href="/administration/fund-drives"
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Heart size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">Fund Drives</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">Manage the church's fund drives — targets, dates, receipts and member invites.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                      </Link>

                      <div
                        onClick={() => {
                          setActiveTab("budget");
                          router.replace("/administration?tab=budget", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><BarChart3 size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">Budget</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">Post the year's plan — income, spending — and publish it to the congregation.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("refunds");
                          router.replace("/administration?tab=refunds", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Undo2 size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">M-Pesa Refunds</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">Return mistaken or duplicate giving through B2C payouts.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                      </div>
                    </>
                  )}

                  {/* The deaconate desk, on phones as in the desktop sidebar —
                      deacons and admin; elders and clerks are not shown it. */}
                  {showDeaconateItems ? (
                    <div
                      onClick={() => {
                        setActiveTab("inventory");
                        router.replace("/administration?tab=inventory", { scroll: false });
                      }}
                      className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Package size={20} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-bark">Deaconate Ministry</span>
                        <span className="mt-0.5 block text-xs leading-5 text-moss">Church property inventory, duty rota, deaconate roster and ordinances calendar.</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                    </div>
                  ) : null}

                  {showEldersItems && isAdmin && (
                    <div
                      onClick={() => {
                        setActiveTab("settings");
                        router.replace("/administration?tab=settings", { scroll: false });
                      }}
                      className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember" aria-hidden="true"><Settings size={20} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-bark">Church Settings</span>
                          <span className="mt-0.5 block text-xs leading-5 text-moss">Configure homepage clarion call message, church location, and church parameters.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
                    </div>
                  )}


                </div>
                </>
                )}
              </div>
            )}

            {/* Eldership Church Clerk Approval Notice */}
            {["users", "leaders", "meetings", "board", "business", "announcements", "requests", "transfers", "settings"].includes(activeTab) && isClerk && !isElder && !isAdmin && (
              <div className="mb-4 rounded-xl border border-gold-sand bg-sand-mist p-3.5 text-xs font-medium text-ember-soft shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold">Eldership (Church Clerk Access):</span>
                  <span>You have rights to access and prepare updates across Eldership. Actions require Elder approval to persist.</span>
                </div>
                <span className="shrink-0 rounded-md bg-gold-sand px-2 py-0.5 text-[10px] font-bold text-gold-brown">Requires Elder Approval</span>
              </div>
            )}

            {/* Users (Members) View */}
            {activeTab === "users" && (isClerk || isElder || isAdmin) && <UserManagement />}

            {/* Leadership — the directory of the church's areas, opened on
                one of them when a rail row (or a link) names it. The API
                decides who may edit; the page itself is open to every office. */}
            {activeTab === "leaders" && <DepartmentHub initialDept={searchDept} />}

            {/* Board and Business Meetings — two rows of the Elders' Desk
                submenu, so the desk opens on the kind the row named and no
                second toggle sits between the two. */}
            {meetingTab && (isClerk || isElder || isAdmin) && (
              <div className="h-full min-h-0 overflow-y-auto custom-hover-scrollbar">
                {meetingKind === "board" ? (
                  <div className="p-4 sm:p-6 lg:p-8">
                    <BoardMeetingManager />
                  </div>
                ) : (
                  <div className="p-4 sm:p-6 lg:p-8">
                    <BusinessMeetingManager />
                  </div>
                )}
              </div>
            )}

            {/* Announcements Manager */}
            {activeTab === "announcements" && (isClerk || isElder || isAdmin) && (
              <div className="h-full min-h-0">
                <AnnouncementManager />
              </div>
            )}

            {/* Received Requests Manager (including Transfers) — the manager
                owns its own scrolling: toolbar pinned, table scrolls. */}
            {(activeTab === "requests" || activeTab === "transfers") && (isClerk || isElder || isAdmin || isRequestsDeskLead) && (
              <div className="h-full min-h-0">
                <RequestsAdminManager
                  initialTab={activeTab === "transfers" ? "transfers" : "all"}
                  focusRequest={searchRequest}
                />
              </div>
            )}

            {/* Treasury Accounts Manager */}
            {activeTab === "accounts" && isFinance && (
              <div className="h-full min-h-0">
                <TreasuryAccountsManager />
              </div>
            )}

            {/* Church Budget Manager — the treasurer posts the year's plan
                and decides when the congregation sees it. */}
            {activeTab === "budget" && isFinance && (
              <div className="h-full min-h-0">
                <ChurchBudgetManager />
              </div>
            )}

            {/* Expenditure Manager */}
            {activeTab === "expenditures" && isFinance && (
              <div className="h-full min-h-0">
                <ExpenditureManager />
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
            {["inventory", "deaconate-rota", "deaconate-members", "deaconate-calendar"].includes(activeTab) && (
              // The deaconate panels own their own scrolling (fixed filters, scrolling
              // rows, fixed actions), so the page itself must not scroll.
              <div className="h-full min-h-0">
                <DeaconateManager
                  initialTab={
                    activeTab === "deaconate-rota"
                      ? "rota"
                      : activeTab === "deaconate-members"
                      ? "members"
                      : activeTab === "deaconate-calendar"
                      ? "calendar"
                      : "inventory"
                  }
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

/** One section heading in the phone overview: the front page for anyone whose
    office spans more than one role — the sidebar's sections as cards. */
function SectionHeadingCard({
  icon,
  label,
  description,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-2xl" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-bark">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-moss">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true" />
    </div>
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
