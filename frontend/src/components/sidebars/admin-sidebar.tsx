"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
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
  Undo2,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type StaffRole =
  | "admin"
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
  profile?: { username: string; role: string; roles?: string[]; email?: string; is_staff?: boolean; is_superuser?: boolean } | null;
  permissions?: {
    isAdmin: boolean;
    isClerk: boolean;
    isElder: boolean;
    isFinance: boolean;
    isDeaconate: boolean;
    roles: string[];
  };
}

export function AdminSidebar({ activeTab, onSelectTab, profile: propProfile, permissions }: AdminSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = activeTab || searchParams.get("tab") || "overview";

  const [profile, setProfile] = useState<{ username: string; role: string; roles?: string[]; is_staff?: boolean; is_superuser?: boolean } | null>(propProfile || null);

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

  const normalizeRole = (role: string) => role.toLowerCase().trim().replace(/[\s-]+/g, "_");
  const profileRoles = [
    ...(Array.isArray(profile?.roles) ? profile.roles : []),
    profile?.role || "",
    profile?.is_staff || profile?.is_superuser ? "admin" : "",
  ]
    .map(normalizeRole)
    .filter(Boolean);
  const userRoles: string[] = permissions?.roles?.length ? permissions.roles : Array.from(new Set(profileRoles.length ? profileRoles : ["member"]));
  const hasAnyRole = (...codes: string[]) => userRoles.some((r) => codes.includes(r));
  const isAdmin = permissions?.isAdmin ?? hasAnyRole("admin");
  const isClerk = permissions?.isClerk ?? hasAnyRole("clerk", "admin");
  const isElder = permissions?.isElder ?? hasAnyRole("elder", "admin");
  const isFinance = permissions?.isFinance ?? hasAnyRole("finance", "treasurer", "admin");
  const isDeaconate = permissions?.isDeaconate ?? hasAnyRole("deacon", "deaconess", "head_deacon", "head_deaconess", "admin", "elder", "clerk");

  const isReconPage = pathname === "/administration/reconciliation";
  // Fund drives are their own page, so their item is highlighted by the URL
  // rather than by the tab the main workspace is showing.
  const isFundDrivesPage = pathname.replace(/\/$/, "") === "/administration/fund-drives";

  const handleTabClick = (tab: string) => {
    if (onSelectTab) {
      onSelectTab(tab);
    }
  };

  return (
    <aside className="hidden h-full min-h-0 w-60 shrink-0 border-r border-[#dfdbd1] bg-[#ede8dc] lg:block">
      <div className="h-full min-h-0 space-y-6 overflow-y-auto p-5 scrollbar-thin">
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
                    <span>Giving Accounts</span>
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
                    <span>Giving Accounts</span>
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

              <Link
                href="/administration/fund-drives"
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                  isFundDrivesPage ? "bg-[#26352f] text-white shadow-sm" : "text-[#26352f] hover:bg-[#dfd9cb]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <HeartHandshake className="h-4 w-4 shrink-0 text-[#5f8067]" />
                  <span>Fund Drives</span>
                </div>
                {isFundDrivesPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
              </Link>

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

              {onSelectTab && !isReconPage ? (
                <button
                  type="button"
                  onClick={() => handleTabClick("refunds")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "refunds" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Undo2 className="h-4 w-4 shrink-0 text-[#b91c1c]" />
                    <span>M-Pesa Refunds</span>
                  </div>
                  {currentTab === "refunds" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </button>
              ) : (
                <Link
                  href="/administration?tab=refunds"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                    currentTab === "refunds" && !isReconPage
                      ? "bg-[#26352f] text-white shadow-sm"
                      : "text-[#26352f] hover:bg-[#dfd9cb]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Undo2 className="h-4 w-4 shrink-0 text-[#b91c1c]" />
                    <span>M-Pesa Refunds</span>
                  </div>
                  {currentTab === "refunds" && !isReconPage && <ChevronRight className="h-3.5 w-3.5 font-bold" />}
                </Link>
              )}
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
                    <span>Inventory</span>
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
                    <span>Inventory</span>
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
              <DeptNavItem tab="dept-amm-members" label="Members" icon={Users} iconColor="text-blue-800" active={currentTab === "dept-amm-members" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
              <DeptNavItem tab="dept-amm-calendar" label="Calendar" icon={CalendarIcon} iconColor="text-blue-800" active={currentTab === "dept-amm-calendar" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
              <DeptNavItem tab="dept-amm-activities" label="Activities" icon={ClipboardList} iconColor="text-blue-800" active={currentTab === "dept-amm-activities" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
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
              <DeptNavItem tab="dept-awm-members" label="Members" icon={Heart} iconColor="text-rose-700" active={currentTab === "dept-awm-members" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
              <DeptNavItem tab="dept-awm-calendar" label="Calendar" icon={CalendarIcon} iconColor="text-rose-700" active={currentTab === "dept-awm-calendar" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
              <DeptNavItem tab="dept-awm-activities" label="Activities" icon={ClipboardList} iconColor="text-rose-700" active={currentTab === "dept-awm-activities" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
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
              <DeptNavItem tab="dept-aym-members" label="Members" icon={Award} iconColor="text-amber-700" active={currentTab === "dept-aym-members" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
              <DeptNavItem tab="dept-aym-calendar" label="Calendar" icon={CalendarIcon} iconColor="text-amber-700" active={currentTab === "dept-aym-calendar" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
              <DeptNavItem tab="dept-aym-activities" label="Activities" icon={ClipboardList} iconColor="text-amber-700" active={currentTab === "dept-aym-activities" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
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
              <DeptNavItem tab="dept-apm-members" label="Members" icon={Shield} iconColor="text-teal-700" active={currentTab === "dept-apm-members" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
              <DeptNavItem tab="dept-apm-calendar" label="Calendar" icon={CalendarIcon} iconColor="text-teal-700" active={currentTab === "dept-apm-calendar" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
              <DeptNavItem tab="dept-apm-activities" label="Activities" icon={ClipboardList} iconColor="text-teal-700" active={currentTab === "dept-apm-activities" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
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
              <DeptNavItem tab="dept-chaplaincy-members" label="Members" icon={BookOpen} iconColor="text-indigo-800" active={currentTab === "dept-chaplaincy-members" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
              <DeptNavItem tab="dept-chaplaincy-calendar" label="Calendar" icon={CalendarIcon} iconColor="text-indigo-800" active={currentTab === "dept-chaplaincy-calendar" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
              <DeptNavItem tab="dept-chaplaincy-activities" label="Activities" icon={ClipboardList} iconColor="text-indigo-800" active={currentTab === "dept-chaplaincy-activities" && !isReconPage} interactive={!!onSelectTab && !isReconPage} onSelect={handleTabClick} />
            </nav>
          </div>
        )}

      </div>
    </aside>
  );
}

function DeptNavItem({
  tab,
  label,
  icon: Icon,
  iconColor,
  active,
  interactive,
  onSelect,
}: {
  tab: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  active: boolean;
  interactive: boolean;
  onSelect: (tab: string) => void;
}) {
  const inner = (
    <div className="flex items-center gap-2.5">
      <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
      <span>{label}</span>
    </div>
  );
  const chevron = active ? <ChevronRight className="h-3.5 w-3.5 font-bold" /> : null;
  const cls = `flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
    active ? "bg-[#26352f] text-white shadow-sm" : "text-[#26352f] hover:bg-[#dfd9cb]"
  }`;
  if (interactive) {
    return (
      <button type="button" onClick={() => onSelect(tab)} className={cls}>
        {inner}
        {chevron}
      </button>
    );
  }
  return (
    <Link href={`/administration?tab=${tab}`} className={cls}>
      {inner}
      {chevron}
    </Link>
  );
}
