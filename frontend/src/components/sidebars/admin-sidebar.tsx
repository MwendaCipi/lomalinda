"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Users,
  Crown,
  Briefcase,
  Shield,
  Tag,
  Scale,
  Megaphone,
  Settings,
  ChevronRight,
  HeartHandshake,
  Landmark,
  Receipt,
  Boxes,
  ClipboardList,
  UserCheck,
  Calendar as CalendarIcon,
  Heart,
  Award,
  BookOpen,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type StaffRole =
  | "admin"
  | "leader"
  | "clerk"
  | "elder"
  | "deacon"
  | "deaconess"
  | "head_deacon"
  | "head_deaconess"
  | "youth_leader"
  | "choir_director"
  | "children_ministry"
  | "men_ministry"
  | "women_ministry"
  | "chaplaincy"
  | "finance"
  | "treasurer"
  | "member";

interface AdminSidebarProps {
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  profile?: { username: string; role: string; roles?: string[]; email?: string } | null;
}

export function AdminSidebar({ activeTab, onSelectTab, profile: propProfile }: AdminSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = activeTab || searchParams.get("tab") || "overview";

  const [profile, setProfile] = useState<{ username: string; role: string; roles?: string[] } | null>(propProfile || null);

  useEffect(() => {
    if (propProfile) {
      setProfile(propProfile);
      return;
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (token) {
      fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setProfile(data);
        })
        .catch(() => {});
    }
  }, [propProfile]);

  const userRoles: string[] = Array.isArray(profile?.roles) && profile.roles.length > 0
    ? profile.roles
    : [(profile?.role || "").toLowerCase().trim() || "member"];
  const hasAnyRole = (...codes: string[]) => userRoles.some((r) => codes.includes(r));
  const isAdmin = hasAnyRole("admin");
  const isClerk = hasAnyRole("clerk", "admin", "leader");
  const isElder = hasAnyRole("elder", "admin", "leader");
  const isFinance = hasAnyRole("finance", "treasurer", "admin", "leader");
  const isDeaconate = hasAnyRole("deacon", "deaconess", "head_deacon", "head_deaconess", "admin", "leader", "elder", "clerk");

  const isReconPage = pathname === "/administration/reconciliation";

  const handleTabClick = (tab: string) => {
    if (onSelectTab) {
      onSelectTab(tab);
    }
  };

  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#dfdbd1] bg-[#ede8dc] lg:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] space-y-6 overflow-y-auto p-5 scrollbar-thin">
        <div className="border-b border-[#dfdbd1] pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#b36b3c]">
            Leader Portal
          </p>
          <p className="mt-1 text-xs text-[#617068]">
            Logged in as <span className="font-semibold text-[#26352f]">{profile?.username || "Staff"}</span>
          </p>
        </div>

        {/* Elders' Desk Section */}
        {(isElder || isClerk || isAdmin) && (
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
              Elders&apos; Desk
            </p>
            <nav className="mt-2 space-y-1">
              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("users")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "users" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="h-4 w-4 shrink-0" />
                    <span>Users</span>
                  </div>
                  {currentTab === "users" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=users"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "users" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="h-4 w-4 shrink-0" />
                    <span>Users</span>
                  </div>
                  {currentTab === "users" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}

              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("leaders")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "leaders" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Crown className="h-4 w-4 shrink-0" />
                    <span>Church Leaders</span>
                  </div>
                  {currentTab === "leaders" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=leaders"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "leaders" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Crown className="h-4 w-4 shrink-0" />
                    <span>Church Leaders</span>
                  </div>
                  {currentTab === "leaders" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}

              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("board")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "board" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Shield className="h-4 w-4 shrink-0" />
                    <span>Board Meetings</span>
                  </div>
                  {currentTab === "board" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=board"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "board" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Shield className="h-4 w-4 shrink-0" />
                    <span>Board Meetings</span>
                  </div>
                  {currentTab === "board" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}

              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("business")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "business" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Briefcase className="h-4 w-4 shrink-0" />
                    <span>Business Meetings</span>
                  </div>
                  {currentTab === "business" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=business"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "business" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Briefcase className="h-4 w-4 shrink-0" />
                    <span>Business Meetings</span>
                  </div>
                  {currentTab === "business" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}

              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("announcements")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "announcements" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Megaphone className="h-4 w-4 shrink-0" />
                    <span>Announcements</span>
                  </div>
                  {currentTab === "announcements" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=announcements"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "announcements" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Megaphone className="h-4 w-4 shrink-0" />
                    <span>Announcements</span>
                  </div>
                  {currentTab === "announcements" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}

              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("requests")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "requests" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <HeartHandshake className="h-4 w-4 shrink-0" />
                    <span>Requests</span>
                  </div>
                  {currentTab === "requests" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=requests"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "requests" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <HeartHandshake className="h-4 w-4 shrink-0" />
                    <span>Requests</span>
                  </div>
                  {currentTab === "requests" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}

              {(isAdmin || isClerk || isElder) && (
                onSelectTab && !isReconPage ? (
                  <button
                    type="button"
                    onClick={() => handleTabClick("settings")}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                      currentTab === "settings" && !isReconPage
                        ? "bg-[#26352f] text-white shadow-sm"
                        : "text-[#26352f] hover:bg-[#dfd9cb]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Settings className="h-4 w-4 shrink-0" />
                      <span>Church Settings</span>
                    </div>
                    {currentTab === "settings" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                  </button>
                ) : (
                  <Link
                    href="/administration?tab=settings"
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                      currentTab === "settings" && !isReconPage
                        ? "bg-[#26352f] text-white shadow-sm"
                        : "text-[#26352f] hover:bg-[#dfd9cb]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Settings className="h-4 w-4 shrink-0" />
                      <span>Church Settings</span>
                    </div>
                    {currentTab === "settings" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                  </Link>
                )
              )}
            </nav>
          </div>
        )}

        {/* Treasury & Finance Section */}
        {isFinance && (
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
              Treasury &amp; Finance
            </p>
            <nav className="mt-2 space-y-1">
              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("finance")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "finance" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Tag className="h-4 w-4 shrink-0" />
                    <span>Giving Purposes</span>
                  </div>
                  {currentTab === "finance" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=finance"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "finance" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Tag className="h-4 w-4 shrink-0" />
                    <span>Giving Purposes</span>
                  </div>
                  {currentTab === "finance" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}

              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("accounts")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "accounts" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Landmark className="h-4 w-4 shrink-0 text-[#b36b3c]" />
                    <span>Treasury Accounts</span>
                  </div>
                  {currentTab === "accounts" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=accounts"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "accounts" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Landmark className="h-4 w-4 shrink-0 text-[#b36b3c]" />
                    <span>Treasury Accounts</span>
                  </div>
                  {currentTab === "accounts" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}

              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("expenditures")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "expenditures" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Receipt className="h-4 w-4 shrink-0 text-[#b91c1c]" />
                    <span>Expenditure</span>
                  </div>
                  {currentTab === "expenditures" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=expenditures"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "expenditures" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Receipt className="h-4 w-4 shrink-0 text-[#b91c1c]" />
                    <span>Expenditure</span>
                  </div>
                  {currentTab === "expenditures" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}

              <Link
                href="/administration/reconciliation"
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                  isReconPage
                    ? "bg-[#26352f] text-white shadow-sm"
                    : "text-[#26352f] hover:bg-[#dfd9cb]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Scale className="h-4 w-4 shrink-0" />
                  <span>Contributions Ledger</span>
                </div>
                {isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
              </Link>
            </nav>
          </div>
        )}

        {/* Deaconate Section */}
        {isDeaconate && (
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
              Deaconate Ministry
            </p>
            <nav className="mt-2 space-y-1">
              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("inventory")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "inventory" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Boxes className="h-4 w-4 shrink-0 text-[#b36b3c]" />
                    <span>Inventory &amp; Property</span>
                  </div>
                  {currentTab === "inventory" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=inventory"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "inventory" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Boxes className="h-4 w-4 shrink-0 text-[#b36b3c]" />
                    <span>Inventory &amp; Property</span>
                  </div>
                  {currentTab === "inventory" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}

              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("deaconate-rota")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "deaconate-rota" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ClipboardList className="h-4 w-4 shrink-0" />
                    <span>Duty Rota</span>
                  </div>
                  {currentTab === "deaconate-rota" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=deaconate-rota"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "deaconate-rota" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ClipboardList className="h-4 w-4 shrink-0" />
                    <span>Duty Rota</span>
                  </div>
                  {currentTab === "deaconate-rota" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}

              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("deaconate-members")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "deaconate-members" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="h-4 w-4 shrink-0" />
                    <span>Deaconate Team</span>
                  </div>
                  {currentTab === "deaconate-members" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=deaconate-members"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "deaconate-members" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="h-4 w-4 shrink-0" />
                    <span>Deaconate Team</span>
                  </div>
                  {currentTab === "deaconate-members" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}

              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("deaconate-calendar")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "deaconate-calendar" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CalendarIcon className="h-4 w-4 shrink-0" />
                    <span>Deaconate Calendar</span>
                  </div>
                  {currentTab === "deaconate-calendar" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=deaconate-calendar"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "deaconate-calendar" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CalendarIcon className="h-4 w-4 shrink-0" />
                    <span>Deaconate Calendar</span>
                  </div>
                  {currentTab === "deaconate-calendar" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}
            </nav>
          </div>
        )}

        {/* Department 1: Adventist Men (AMM) */}
        {(isElder || isClerk || isAdmin || hasAnyRole("men_ministry")) && (
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
              Adventist Men (AMM)
            </p>
            <nav className="mt-2 space-y-1">
              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("dept-amm")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "dept-amm" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="h-4 w-4 shrink-0 text-blue-800" />
                    <span>Adventist Men</span>
                  </div>
                  {currentTab === "dept-amm" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=dept-amm"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "dept-amm" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="h-4 w-4 shrink-0 text-blue-800" />
                    <span>Adventist Men</span>
                  </div>
                  {currentTab === "dept-amm" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}
            </nav>
          </div>
        )}

        {/* Department 2: Adventist Women (AWM) */}
        {(isElder || isClerk || isAdmin || hasAnyRole("women_ministry")) && (
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
              Adventist Women (AWM)
            </p>
            <nav className="mt-2 space-y-1">
              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("dept-awm")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "dept-awm" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Heart className="h-4 w-4 shrink-0 text-rose-700" />
                    <span>Adventist Women</span>
                  </div>
                  {currentTab === "dept-awm" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=dept-awm"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "dept-awm" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Heart className="h-4 w-4 shrink-0 text-rose-700" />
                    <span>Adventist Women</span>
                  </div>
                  {currentTab === "dept-awm" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}
            </nav>
          </div>
        )}

        {/* Department 3: Adventist Youth & Children */}
        {(isElder || isClerk || isAdmin || hasAnyRole("youth_leader", "children_ministry")) && (
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
              Adventist Youth &amp; Children
            </p>
            <nav className="mt-2 space-y-1">
              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("dept-aym")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "dept-aym" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Award className="h-4 w-4 shrink-0 text-amber-700" />
                    <span>Youth &amp; Children</span>
                  </div>
                  {currentTab === "dept-aym" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=dept-aym"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "dept-aym" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Award className="h-4 w-4 shrink-0 text-amber-700" />
                    <span>Youth &amp; Children</span>
                  </div>
                  {currentTab === "dept-aym" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}
            </nav>
          </div>
        )}

        {/* Department 4: Adventist Possibility Ministries (APM) */}
        {(isElder || isClerk || isAdmin) && (
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
              Adventist Possibility (APM)
            </p>
            <nav className="mt-2 space-y-1">
              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("dept-apm")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "dept-apm" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Shield className="h-4 w-4 shrink-0 text-teal-700" />
                    <span>Possibility Ministry (APM)</span>
                  </div>
                  {currentTab === "dept-apm" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=dept-apm"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "dept-apm" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Shield className="h-4 w-4 shrink-0 text-teal-700" />
                    <span>Possibility Ministry (APM)</span>
                  </div>
                  {currentTab === "dept-apm" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}
            </nav>
          </div>
        )}

        {/* Department 5: Chaplaincy Ministry */}
        {(isElder || isClerk || isAdmin || hasAnyRole("chaplaincy")) && (
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
              Chaplaincy Ministry
            </p>
            <nav className="mt-2 space-y-1">
              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("dept-chaplaincy")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "dept-chaplaincy" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <BookOpen className="h-4 w-4 shrink-0 text-indigo-800" />
                    <span>Chaplaincy &amp; Pastoral Care</span>
                  </div>
                  {currentTab === "dept-chaplaincy" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=dept-chaplaincy"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "dept-chaplaincy" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <BookOpen className="h-4 w-4 shrink-0 text-indigo-800" />
                    <span>Chaplaincy &amp; Pastoral Care</span>
                  </div>
                  {currentTab === "dept-chaplaincy" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}
            </nav>
          </div>
        )}

      </div>
    </aside>
  );
}
