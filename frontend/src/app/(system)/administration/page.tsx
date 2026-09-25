"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AnnouncementManager } from "@/components/announcement-manager";
import { ChurchSettingsManager } from "@/components/church-settings-manager";
import { BusinessMeetingManager } from "@/components/business-meeting-manager";
import { BoardMeetingManager } from "@/components/board-meeting-manager";
import { UserManagement } from "@/components/user-management";
import { LeaderManagement } from "@/components/leader-management";
import { TransferManagement } from "@/components/transfer-management";
import { RequestsAdminManager } from "@/components/requests-admin-manager";
import { usePendingRequestCounts } from "@/hooks/use-pending-request-counts";
import { TreasuryAccountsManager } from "@/components/treasury-accounts-manager";
import { ExpenditureManager } from "@/components/expenditure-manager";
import { MpesaRefundManager } from "@/components/mpesa-refund-manager";
import { DeaconateManager } from "@/components/deaconate-manager";
import { DepartmentManager, DepartmentKey } from "@/components/department-manager";
import { AdminSidebar } from "@/components/sidebars/admin-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type StaffRole =
  | "admin"
  | "clerk"
  | "elder"
  | "youth_leader"
  | "choir_director"
  | "children_ministry"
  | "men_ministry"
  | "women_ministry"
  | "chaplaincy"
  | "treasurer"
  | "member";

const officialRoles: StaffRole[] = [
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
  leaders: "church leaders",
  board: "board meetings",
  business: "business meetings",
  announcements: "announcements",
  requests: "requests",
  transfers: "membership transfers",
  accounts: "treasury accounts",
  expenditures: "expenditure records",
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
  const isYouthLeader = hasAnyRole("youth_leader", "admin");
  const isChoirDirector = hasAnyRole("choir_director", "admin");
  const isFinance = hasAnyRole("treasurer", "admin");
  // Every tab renders a full-height panel (table or cards) that scrolls
  // internally, so the workspace never scrolls the page itself. "overview"
  // is the mobile card grid and keeps normal scrolling.
  const tableContainedTabs = ["users", "leaders", "accounts", "expenditures", "refunds", "announcements", "requests", "transfers", "board", "business", "deaconate-rota", "deaconate-members", "deaconate-calendar", "inventory", "settings"];

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
      <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">
        Loading {ADMIN_LOADING_LABELS[searchTab ?? ""] ?? "the administration workspace"}...
      </main>
    );
  }

  if (status === "denied") return null;

  return (
    <main className="administration-workspace pinned-workspace min-h-screen md:h-[calc(100dvh-4rem)] bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        {/* DESKTOP CONTEXTUAL SIDEBAR (Permanently Sticky on Desktop, Touching Header) */}
        <AdminSidebar
          activeTab={activeTab}
          profile={profile}
          permissions={{
            isAdmin,
            isClerk,
            isElder,
            isFinance,
            isDeaconate: hasAnyRole("deacon", "deaconess", "head_deacon", "head_deaconess", "admin", "elder", "clerk"),
            roles: userRoles,
          }}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            router.push(`/administration?tab=${tab}`, { scroll: false });
          }}
        />

        {/* MAIN WORKSPACE CONTENT */}
        <div className="flex-1 min-w-0 h-full p-0 flex flex-col overflow-hidden">
          <div className="w-full h-full flex flex-col bg-white border-l border-[#dfdbd1] overflow-hidden">
            {/* Mobile Back Button (Visible only on Mobile when viewing sub-tab;
                the leaders view opts out — its full-height table owns the screen) */}
            {activeTab !== "overview" && activeTab !== "users" && activeTab !== "leaders" && (
              <div className="flex shrink-0 items-center justify-between border-b border-[#dfdbd1] bg-white p-4 lg:hidden">
                <button
                  onClick={() => {
                    setActiveTab("overview");
                    router.push("/administration?tab=overview", { scroll: false });
                  }}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#26352f]"
                >
                  &larr; Back to Cards Overview
                </button>
              </div>
            )}

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
                <div className="grid gap-5 sm:grid-cols-2">
                  {isClerk && (
                    <>
                      <div
                        onClick={() => {
                          setActiveTab("users");
                          router.push("/administration?tab=users", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c]/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] text-2xl" aria-hidden="true">👥</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-[#26352f]">User Management</span>
                          <span className="mt-0.5 block text-xs leading-5 text-[#617068]">View registered church members or add new member records.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" aria-hidden="true" />
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("leaders");
                          router.push("/administration?tab=leaders", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c]/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] text-2xl" aria-hidden="true">👑</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-[#26352f]">Church Leaders</span>
                          <span className="mt-0.5 block text-xs leading-5 text-[#617068]">Set, update, or unset leadership roles for church members.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" aria-hidden="true" />
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("transfers");
                          router.push("/administration?tab=transfers", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c]/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] text-2xl" aria-hidden="true">📋</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-[#26352f]">Membership Transfers</span>
                          <span className="mt-0.5 block text-xs leading-5 text-[#617068]">Process incoming & outgoing church membership transfer requests.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" aria-hidden="true" />
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("board");
                          router.push("/administration?tab=board", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c]/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] text-2xl" aria-hidden="true">🛡️</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-[#26352f]">Board Meetings</span>
                          <span className="mt-0.5 block text-xs leading-5 text-[#617068]">Schedule board meetings, attach documents per agenda, record minutes, and invite board members.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" aria-hidden="true" />
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("business");
                          router.push("/administration?tab=business", { scroll: false });
                        }}
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c]/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] text-2xl" aria-hidden="true">💼</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-[#26352f]">Business Meetings</span>
                          <span className="mt-0.5 block text-xs leading-5 text-[#617068]">Manage business meeting schedules, agendas, supporting files, and minutes.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" aria-hidden="true" />
                      </div>
                    </>
                  )}

                  {isElder && (
                    <div
                      onClick={() => {
                        setActiveTab("announcements");
                        router.push("/administration?tab=announcements", { scroll: false });
                      }}
                      className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c]/50"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] text-2xl" aria-hidden="true">📢</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-[#26352f]">Announcements</span>
                          <span className="mt-0.5 block text-xs leading-5 text-[#617068]">Publish Sabbath & weekly public announcements and track pledges.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" aria-hidden="true" />
                    </div>
                  )}

                  {(isElder || isClerk) && (
                    <div
                      onClick={() => {
                        setActiveTab("requests");
                        router.push("/administration?tab=requests", { scroll: false });
                      }}
                      className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c]/50"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] text-2xl" aria-hidden="true">🙏</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="block text-sm font-bold text-[#26352f]">Received Requests</span>
                            {/* The phone hub is where a leader lands, so the count of
                                unanswered requests travels with the card. */}
                            {pendingRequests.total > 0 && (
                              <span
                                title={`${pendingRequests.total} request${pendingRequests.total === 1 ? "" : "s"} awaiting review`}
                                className="rounded-full bg-[#b36b3c] px-1.5 py-0.5 text-[10px] font-bold text-white"
                              >
                                {pendingRequests.total}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-[#617068]">Review join, prayer, visitation, dedication, and support requests.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" aria-hidden="true" />
                    </div>
                  )}

                  {isFinance && (
                    <>
                      <Link
                        href="/administration/reconciliation"
                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c]/50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] text-2xl" aria-hidden="true">⚖️</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-[#26352f]">Contributions Ledger</span>
                          <span className="mt-0.5 block text-xs leading-5 text-[#617068]">Record cash receipts and track all giving breakdown ledgers.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" aria-hidden="true" />
                      </Link>
                    </>
                  )}

                  {isAdmin && (
                    <div
                      onClick={() => {
                        setActiveTab("settings");
                        router.push("/administration?tab=settings", { scroll: false });
                      }}
                      className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c]/50"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] text-2xl" aria-hidden="true">⚙️</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-[#26352f]">Church Settings</span>
                          <span className="mt-0.5 block text-xs leading-5 text-[#617068]">Configure homepage clarion call message, church location, and church parameters.</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" aria-hidden="true" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Elders' Desk Church Clerk Approval Notice */}
            {["users", "leaders", "board", "business", "announcements", "requests", "transfers", "settings"].includes(activeTab) && isClerk && !isElder && !isAdmin && (
              <div className="mb-4 rounded-xl border border-[#e2d5b6] bg-[#fdfbf7] p-3.5 text-xs font-medium text-[#8c572b] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold">Elders&apos; Desk (Church Clerk Access):</span>
                  <span>You have rights to access and prepare updates across Elders&apos; Desk. Actions require Elder approval to persist.</span>
                </div>
                <span className="shrink-0 rounded-md bg-[#e2d5b6] px-2 py-0.5 text-[10px] font-bold text-[#5c3a1c]">Requires Elder Approval</span>
              </div>
            )}

            {/* Users (Members) View */}
            {activeTab === "users" && (isClerk || isElder || isAdmin) && <UserManagement />}

            {/* Church Leaders View */}
            {activeTab === "leaders" && (isClerk || isElder || isAdmin) && <LeaderManagement />}

            {/* Board Meetings Manager */}
            {activeTab === "board" && (isClerk || isElder || isAdmin) && (
              <div className="p-4 sm:p-6 lg:p-8">
                <BoardMeetingManager />
              </div>
            )}

            {/* Business Meetings Manager */}
            {activeTab === "business" && (isClerk || isElder || isAdmin) && (
              <div className="p-4 sm:p-6 lg:p-8">
                <BusinessMeetingManager />
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
            {(activeTab === "requests" || activeTab === "transfers") && (isClerk || isElder || isAdmin) && (
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

export default function AdministrationPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">
          Loading Leader Portal...
        </main>
      }
    >
      <AdministrationContent />
    </Suspense>
  );
}
