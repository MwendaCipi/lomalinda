"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { GivingPurposeManager } from "@/components/giving-purpose-manager";
import { AnnouncementManager } from "@/components/announcement-manager";
import { ChurchSettingsManager } from "@/components/church-settings-manager";
import { BusinessMeetingManager } from "@/components/business-meeting-manager";
import { BoardMeetingManager } from "@/components/board-meeting-manager";
import { UserManagement } from "@/components/user-management";
import { LeaderManagement } from "@/components/leader-management";
import { TransferManagement } from "@/components/transfer-management";
import { RequestsAdminManager } from "@/components/requests-admin-manager";
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
  | "finance"
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
  "finance",
  "treasurer",
];

type Transfer = {
  id: number;
  member_name: string;
  transfer_type: string;
  other_church: string;
};

function AdministrationContent() {
  const searchParams = useSearchParams();
  const searchTab = searchParams.get("tab");

  const [status, setStatus] = useState<"loading" | "authorized" | "denied">("loading");
  const [profile, setProfile] = useState<{ username: string; role: string; roles?: string[]; email?: string } | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [activeTab, setActiveTab] = useState<string>("overview");

  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      setStatus("denied");
      return;
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

          const effectiveRole = userRoles.find((r) => r !== "member") || (rawRole === "member" && (data.is_staff || data.is_superuser) ? "admin" : rawRole);
          if (["clerk", "elder", "admin"].includes(effectiveRole)) {
            fetch(`${API_URL}/api/members/transfers/`, { headers: { Authorization: `Bearer ${token}` } })
              .then((res) => (res.ok ? res.json() : []))
              .then((t) => setTransfers(t))
              .catch(() => {});
          }
        } else {
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

  const userRoles: string[] = Array.isArray(profile?.roles) && profile.roles.length > 0
    ? profile.roles
    : [(profile?.role || "").toLowerCase().trim() || "member"];
  const hasAnyRole = (...codes: string[]) => userRoles.some((r) => codes.includes(r));
  const isAdmin = hasAnyRole("admin");
  const isClerk = hasAnyRole("clerk", "admin");
  const isElder = hasAnyRole("elder", "admin");
  const isYouthLeader = hasAnyRole("youth_leader", "admin");
  const isChoirDirector = hasAnyRole("choir_director", "admin");
  const isFinance = hasAnyRole("finance", "treasurer", "admin");
  // Every tab renders a full-height panel (table or cards) that scrolls
  // internally, so the workspace never scrolls the page itself. "overview"
  // is the mobile card grid and keeps normal scrolling.
  const tableContainedTabs = ["users", "leaders", "accounts", "expenditures", "finance", "refunds", "announcements", "requests", "transfers", "board", "business", "deaconate-rota", "deaconate-members", "deaconate-calendar", "inventory", "settings"];

  // Synchronize active tab safely without infinite loop
  useEffect(() => {
    if (searchTab) {
      setActiveTab(searchTab);
    } else if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      const defaultTab = isClerk ? "users" : isElder ? "announcements" : isFinance ? "finance" : "settings";
      setActiveTab(defaultTab);
    } else {
      setActiveTab("overview");
    }
  }, [searchTab, isClerk, isElder, isFinance]);

  if (status === "loading") {
    return (
      <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">
        Checking your administration access...
      </main>
    );
  }

  if (status === "denied") return null;

  return (
    <main className="administration-workspace min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        {/* DESKTOP CONTEXTUAL SIDEBAR (Permanently Sticky on Desktop, Touching Header) */}
        <AdminSidebar
          activeTab={activeTab}
          profile={profile}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            router.push(`/administration?tab=${tab}`, { scroll: false });
          }}
        />

        {/* MAIN WORKSPACE CONTENT */}
        <div className="flex-1 min-w-0 h-full p-0 flex flex-col overflow-hidden">
          <div className="w-full h-full flex flex-col bg-white border-l border-[#dfdbd1] overflow-hidden">
            {/* Mobile Back Button (Visible only on Mobile when viewing sub-tab) */}
            {activeTab !== "overview" && activeTab !== "users" && (
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
                  ? "p-0 overflow-hidden"
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
                        className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md"
                      >
                        <span className="text-3xl">👥</span>
                        <h2 className="mt-3 text-lg font-bold">Users (Members)</h2>
                        <p className="mt-1 text-xs leading-relaxed text-[#617068]">
                          View registered church members or add new member records.
                        </p>
                        <span className="mt-4 inline-block text-xs font-bold text-[#b36b3c]">
                          Manage Members &rarr;
                        </span>
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("leaders");
                          router.push("/administration?tab=leaders", { scroll: false });
                        }}
                        className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md"
                      >
                        <span className="text-3xl">👑</span>
                        <h2 className="mt-3 text-lg font-bold">Church Leaders</h2>
                        <p className="mt-1 text-xs leading-relaxed text-[#617068]">
                          Set, update, or unset leadership roles for church members.
                        </p>
                        <span className="mt-4 inline-block text-xs font-bold text-[#b36b3c]">
                          Manage Leaders &rarr;
                        </span>
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("transfers");
                          router.push("/administration?tab=transfers", { scroll: false });
                        }}
                        className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md"
                      >
                        <span className="text-3xl">📋</span>
                        <h2 className="mt-3 text-lg font-bold">Membership Transfers</h2>
                        <p className="mt-1 text-xs leading-relaxed text-[#617068]">
                          Process incoming & outgoing church membership transfer requests.
                        </p>
                        <span className="mt-4 inline-block text-xs font-bold text-[#b36b3c]">
                          Manage Transfers &rarr;
                        </span>
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("board");
                          router.push("/administration?tab=board", { scroll: false });
                        }}
                        className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md"
                      >
                        <span className="text-3xl">🛡️</span>
                        <h2 className="mt-3 text-lg font-bold">Board Meetings</h2>
                        <p className="mt-1 text-xs leading-relaxed text-[#617068]">
                          Schedule board meetings, attach documents per agenda, record minutes, and invite board members.
                        </p>
                        <span className="mt-4 inline-block text-xs font-bold text-[#b36b3c]">
                          Board Meetings &rarr;
                        </span>
                      </div>

                      <div
                        onClick={() => {
                          setActiveTab("business");
                          router.push("/administration?tab=business", { scroll: false });
                        }}
                        className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md"
                      >
                        <span className="text-3xl">💼</span>
                        <h2 className="mt-3 text-lg font-bold">Business Meetings</h2>
                        <p className="mt-1 text-xs leading-relaxed text-[#617068]">
                          Manage business meeting schedules, agendas, supporting files, and minutes.
                        </p>
                        <span className="mt-4 inline-block text-xs font-bold text-[#b36b3c]">
                          Business Meetings &rarr;
                        </span>
                      </div>
                    </>
                  )}

                  {isElder && (
                    <div
                      onClick={() => {
                        setActiveTab("announcements");
                        router.push("/administration?tab=announcements", { scroll: false });
                      }}
                      className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md"
                    >
                      <span className="text-3xl">📢</span>
                      <h2 className="mt-3 text-lg font-bold">Announcements</h2>
                      <p className="mt-1 text-xs leading-relaxed text-[#617068]">
                        Publish Sabbath & weekly public announcements and track pledges.
                      </p>
                      <span className="mt-4 inline-block text-xs font-bold text-[#b36b3c]">
                        Manage Announcements &rarr;
                      </span>
                    </div>
                  )}

                  {(isElder || isClerk) && (
                    <div
                      onClick={() => {
                        setActiveTab("requests");
                        router.push("/administration?tab=requests", { scroll: false });
                      }}
                      className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md"
                    >
                      <span className="text-3xl">🙏</span>
                      <h2 className="mt-3 text-lg font-bold">Pastoral Requests</h2>
                      <p className="mt-1 text-xs leading-relaxed text-[#617068]">
                        Review prayer requests, visitation, child dedications, and support submissions.
                      </p>
                      <span className="mt-4 inline-block text-xs font-bold text-[#b36b3c]">
                        View Requests &rarr;
                      </span>
                    </div>
                  )}

                  {isFinance && (
                    <>
                      <div
                        onClick={() => {
                          setActiveTab("finance");
                          router.push("/administration?tab=finance", { scroll: false });
                        }}
                        className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md"
                      >
                        <span className="text-3xl">🏷️</span>
                        <h2 className="mt-3 text-lg font-bold">Giving Accounts &amp; Drives</h2>
                        <p className="mt-1 text-xs leading-relaxed text-[#617068]">
                          Manage giving accounts and fund drives shown on the giving forms.
                        </p>
                        <span className="mt-4 inline-block text-xs font-bold text-[#b36b3c]">
                          Manage Accounts &rarr;
                        </span>
                      </div>

                      <Link
                        href="/administration/reconciliation"
                        className="rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md"
                      >
                        <span className="text-3xl">⚖️</span>
                        <h2 className="mt-3 text-lg font-bold">Contributions Ledger</h2>
                        <p className="mt-1 text-xs leading-relaxed text-[#617068]">
                          Record cash receipts and track all giving breakdown ledgers.
                        </p>
                        <span className="mt-4 inline-block text-xs font-bold text-[#b36b3c]">
                          Open Ledger &rarr;
                        </span>
                      </Link>
                    </>
                  )}

                  {isAdmin && (
                    <div
                      onClick={() => {
                        setActiveTab("settings");
                        router.push("/administration?tab=settings", { scroll: false });
                      }}
                      className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md"
                    >
                      <span className="text-3xl">⚙️</span>
                      <h2 className="mt-3 text-lg font-bold">Church Settings</h2>
                      <p className="mt-1 text-xs leading-relaxed text-[#617068]">
                        Configure homepage clarion call message, church location, and church parameters.
                      </p>
                      <span className="mt-4 inline-block text-xs font-bold text-[#b36b3c]">
                        Manage Settings &rarr;
                      </span>
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
              <div>
                <AnnouncementManager />
              </div>
            )}

            {/* Pastoral & Member Requests Manager (including Transfers) */}
            {(activeTab === "requests" || activeTab === "transfers") && (isClerk || isElder || isAdmin) && (
              <div>
                <RequestsAdminManager initialTab={activeTab === "transfers" ? "transfers" : "prayer"} />
              </div>
            )}

            {/* Treasury Accounts Manager */}
            {activeTab === "accounts" && isFinance && (
              <div>
                <TreasuryAccountsManager />
              </div>
            )}

            {/* Expenditure Manager */}
            {activeTab === "expenditures" && isFinance && (
              <div>
                <ExpenditureManager />
              </div>
            )}

            {/* M-Pesa Refund Manager */}
            {activeTab === "refunds" && isFinance && (
              <div>
                <MpesaRefundManager />
              </div>
            )}

            {/* Giving Accounts & Fund Drives Manager */}
            {activeTab === "finance" && isFinance && (
              <div>
                <GivingPurposeManager />
              </div>
            )}

            {/* Church Settings Manager */}
            {activeTab === "settings" && (isAdmin || isClerk || isElder) && (
              <div>
                <ChurchSettingsManager />
              </div>
            )}

            {/* Deaconate Ministry Manager */}
            {["inventory", "deaconate-rota", "deaconate-members", "deaconate-calendar"].includes(activeTab) && (
              <div>
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
              <div>
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
