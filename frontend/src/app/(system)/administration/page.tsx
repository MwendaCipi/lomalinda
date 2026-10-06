"use client";

import Link from "next/link";
import { Armchair, BarChart3, Briefcase, ChevronRight, ClipboardList, HandHelping, Heart, Landmark, Megaphone, Package, Scale, Settings, ShieldCheck, Undo2, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
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

/** The two kinds of meeting the Clerk's desk keeps the minutes for. */
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
  const [profile, setProfile] = useState<{ username: string; role: string; roles?: string[]; email?: string; is_staff?: boolean; is_superuser?: boolean } | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  // The desk the URL falls back to when it names no tab: the phone's overview,
  // or the desk the role keeps on a desktop. The URL itself is the tab.
  const [defaultTab, setDefaultTab] = useState<string>("overview");

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
        const inArea = (data?.my_departments ?? []).some((row: { code?: string }) => row.code);
        // Opening one area's page is everyone's door: the rail's area rows
        // land here read-mostly, whatever the viewer belongs to. The desks'
        // writes stay guarded server-side.
        const opensAnArea = Boolean(searchDept);
        const isOfficial =
          data &&
          (userRoles.some((r) => officialRoles.includes(r as StaffRole)) ||
            data.is_staff ||
            data.is_superuser ||
            rawRole === "admin" ||
            inArea ||
            opensAnArea);

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
  const isFinance = hasAnyRole("treasurer", "admin");
  // The deaconate desk belongs to the deacons and the admin; elders and
  // clerks reach their work from the Elders' Desk.
  const isDeaconate = hasAnyRole("deacon", "deaconess", "head_deacon", "head_deaconess", "admin");
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
  const activeTab = searchTab ? (searchTab === "expenditures" ? "accounts" : searchTab) : defaultTab;

  const tableContainedTabs = ["users", "leaders", "accounts", "expenditures", "budget", "refunds", "announcements", "requests", "transfers", "meetings", "board", "business", "deaconate-rota", "deaconate-members", "deaconate-calendar", "inventory", "settings"];

  /**
   * Meetings — board and business are rows of the Clerkship strip, so the
   * kind is the tab itself: `?tab=board` and `?tab=business` each open their
   * own list, and an old `?tab=meetings` link still lands on board.
   */
  const meetingTab = activeTab === "meetings" || activeTab === "board" || activeTab === "business";
  const meetingKind: MeetingKind = activeTab === "business" ? "business" : "board";

  // The fallback desk, chosen once the role is known. A URL tab always
  // outranks it (see `activeTab` above), so this never delays a toggle.
  useEffect(() => {
    if (searchTab) return;
    setDefaultTab(
      typeof window !== "undefined" && window.innerWidth >= 1024
        ? isClerk
          ? "users"
          : isElder
            ? "announcements"
            : isFinance
              ? "accounts"
              : "settings"
        : "overview"
    );
  }, [searchTab, isClerk, isElder, isFinance]);

  // The phone's overview, grouped by desk: each desk is a heading with a card
  // per page it holds. The desktop rail already names these places, which is
  // why the whole page is hidden from `lg`.
  const overviewDesks: OverviewDesk[] = (
    [
    // Administration — the console's own pages, and all the section is: the
    // church's members and the roles they hold, and the church's own settings.
    // A ministry or department is administered from Areas (its own desk), and
    // the desks keep their pages below, so nothing is stranded on a phone.
    isClerk || isElder || isAdmin
      ? {
          label: "Administration",
          icon: <ShieldCheck size={16} aria-hidden="true" />,
          description: "The church's members, their roles and the church's own settings.",
          cards: [
            { icon: <Users size={20} aria-hidden="true" />, label: "User Management", description: "The church register — every member, the roles they hold and their standing.", href: "/administration?tab=users" },
            { icon: <Settings size={20} aria-hidden="true" />, label: "Church Settings", description: "The church's name, channels, meeting times and public record.", href: "/administration?tab=settings" },
          ],
        }
      : null,
    hasClerkship
      ? {
          label: "Clerkship",
          icon: <ClipboardList size={16} aria-hidden="true" />,
          description: "The meetings' minutes and the membership transfers.",
          cards: [
            { icon: <Armchair size={20} aria-hidden="true" />, label: "Board Meetings", description: "The board's schedules, agendas, files and minutes.", href: "/administration?tab=board" },
            { icon: <Briefcase size={20} aria-hidden="true" />, label: "Business Meetings", description: "The congregation in session: agendas, files and minutes.", href: "/administration?tab=business" },
            { icon: <ClipboardList size={20} aria-hidden="true" />, label: "Membership Requests", description: "Process incoming & outgoing church membership requests.", href: "/administration?tab=transfers" },
          ],
        }
      : null,
    hasEldership
      ? {
          label: "Eldership",
          icon: <Armchair size={16} aria-hidden="true" />,
          description: "The church's announcements and the requests members send.",
          cards: [
            { icon: <Megaphone size={20} aria-hidden="true" />, label: "Announcements", description: "Publish Sabbath & weekly public announcements and track pledges.", href: "/administration?tab=announcements" },
            { icon: <HandHelping size={20} aria-hidden="true" />, label: "Received Requests", description: "Review join, prayer, visitation, dedication, and support requests.", href: "/administration?tab=requests", badge: pendingRequests.total },
          ],
        }
      : null,
    hasTreasury
      ? {
          label: "Treasury & Finance",
          icon: <Landmark size={16} aria-hidden="true" />,
          description: "Accounts, ledger, fund drives, budget and refunds.",
          cards: [
            { icon: <Scale size={20} aria-hidden="true" />, label: "Contributions Ledger", description: "Record cash receipts and track all giving breakdown ledgers.", href: "/administration/reconciliation" },
            { icon: <Landmark size={20} aria-hidden="true" />, label: "Church Accounts", description: "Set up church accounts, watch balances, track income and spending, and promote an account into a fund drive.", href: "/administration?tab=accounts" },
            { icon: <Heart size={20} aria-hidden="true" />, label: "Fund Drives", description: "Manage the church's fund drives — targets, dates, receipts and member invites.", href: "/administration/fund-drives" },
            { icon: <BarChart3 size={20} aria-hidden="true" />, label: "Church Budget", description: "Post the year's plan — income, spending — and publish it to the congregation.", href: "/administration?tab=budget" },
            { icon: <Undo2 size={20} aria-hidden="true" />, label: "M-Pesa Refunds", description: "Return mistaken or duplicate giving through B2C payouts.", href: "/administration?tab=refunds" },
          ],
        }
      : null,
    hasDeaconate
      ? {
          label: "Deaconate Ministry",
          icon: <Package size={16} aria-hidden="true" />,
          description: "Church property, the duty rota, the team and the ordinances calendar.",
          cards: [
            { icon: <Package size={20} aria-hidden="true" />, label: "Deaconate Ministry", description: "Church property inventory, duty rota, deaconate roster and ordinances calendar.", href: "/administration?tab=inventory" },
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
          The workspace needs the church&apos;s server. Nothing is lost — it opens again the moment the connection is back.
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
            {["users", "leaders", "meetings", "board", "business", "announcements", "requests", "transfers", "settings"].includes(activeTab) && isClerk && !isElder && !isAdmin && (
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

            {/* Leadership — the directory of the church's areas, opened on
                one of them when a rail row (or a link) names it. The API
                decides who may edit; the page itself is open to every office. */}
            {activeTab === "leaders" && <DepartmentHub initialDept={searchDept} />}

            {/* Board and Business Meetings — two rows of the Clerkship strip,
                so the desk opens on the kind the row named and no second
                toggle sits between the two. */}
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
