"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

import { stewardshipLinks } from "@/config/site-sections";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type OfficeRole =
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
  | "treasurer";

/**
 * The stewardship sidebar, upgraded for office holders.
 *
 * On the support pages an officer used to lose every navigation but the five
 * stewardship links — worst on a fund drive's own page, where the admin work
 * (edit, receipts, invites) lives but the way back to the Leader Portal did
 * not. When the signed-in member holds an office role, the Leader Portal's
 * sections render beneath the stewardship links; a plain member sees only the
 * stewardship list, exactly as before.
 */
export function SupportSidebar() {
  const pathname = usePathname();
  const [offices, setOffices] = useState<OfficeRole[]>([]);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const roles = [
          ...(Array.isArray(data.roles) ? data.roles : []),
          data.role || "",
        ]
          .map((role: string) => String(role).toLowerCase().trim().replace(/[\s-]+/g, "_"))
          .filter((role: string) => role !== "member" && role !== "");
        setOffices([...new Set(roles)] as OfficeRole[]);
      })
      .catch(() => {});
  }, []);

  const hasOffice = (codes: OfficeRole[]) => offices.some((role) => codes.includes(role));
  const isAdmin = hasOffice(["admin"]);
  const isClerk = hasOffice(["clerk", "admin"]);
  const isElder = hasOffice(["elder", "admin"]);
  const isFinance = hasOffice(["treasurer", "admin"]);

  const normalized = (pathname ?? "").replace(/\/+$/, "") || "/";

  return (
    <aside className="hidden h-full min-h-0 w-60 shrink-0 border-r border-[#dfdbd1] bg-[#ede8dc] lg:block">
      <div className="h-full min-h-0 space-y-6 overflow-y-auto p-5 scrollbar-thin">
        <div className="border-b border-[#dfdbd1] pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#b36b3c]">
            Stewardship &amp; Support
          </p>
          <p className="mt-1 text-xs text-[#617068]">
            Support church operations, building projects &amp; view finances.
          </p>
        </div>

        <nav className="space-y-1.5">
          {stewardshipLinks.map((item) => {
            // next.config sets trailingSlash: true, so live paths carry a
            // trailing slash ("/support/in-kind/") that would never equal
            // the bare href — compare without it.
            const target = item.href.replace(/\/+$/, "");
            const isActive =
              normalized === target ||
              (item.href === "/give" && normalized === "/support/give") ||
              (item.href === "/support/campaigns" &&
                normalized.startsWith("/support/campaigns"));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition ${
                  isActive
                    ? "bg-[#26352f] text-white shadow-sm"
                    : "text-[#26352f] hover:bg-[#f7f4ee]"
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
                {isActive && <ChevronRight className="h-4 w-4 font-bold" />}
              </Link>
            );
          })}
        </nav>

        {isElder || isClerk || isFinance ? (
          <div className="border-t border-[#dfdbd1] pt-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
              Leader Portal
            </p>
            <nav className="mt-2 space-y-1">
              {isClerk && (
                <Link href="/administration?tab=users" className={portalLinkClass(normalized, "/administration/users")}>
                  User Management
                  <ChevronRight className="h-3.5 w-3.5 font-bold" />
                </Link>
              )}
              {isClerk && (
                <Link href="/administration?tab=leaders" className={portalLinkClass(normalized, "/administration/leaders")}>
                  Church Leaders &amp; Roles
                  <ChevronRight className="h-3.5 w-3.5 font-bold" />
                </Link>
              )}
              {isElder && (
                <Link href="/administration?tab=announcements" className={portalLinkClass(normalized, "/administration/announcements")}>
                  Announcements
                  <ChevronRight className="h-3.5 w-3.5 font-bold" />
                </Link>
              )}
              {isFinance && (
                <Link href="/administration?tab=accounts" className={portalLinkClass(normalized, "/administration/accounts")}>
                  Treasury Accounts
                  <ChevronRight className="h-3.5 w-3.5 font-bold" />
                </Link>
              )}
              {isFinance && (
                <Link href="/administration/fund-drives" className={portalLinkClass(normalized, "/administration/fund-drives")}>
                  Fund Drives
                  <ChevronRight className="h-3.5 w-3.5 font-bold" />
                </Link>
              )}
              {isFinance && (
                <Link href="/administration/reconciliation" className={portalLinkClass(normalized, "/administration/reconciliation")}>
                  Contributions Ledger
                  <ChevronRight className="h-3.5 w-3.5 font-bold" />
                </Link>
              )}
              {isAdmin && (
                <Link href="/administration?tab=settings" className={portalLinkClass(normalized, "/administration/settings")}>
                  Church Settings
                  <ChevronRight className="h-3.5 w-3.5 font-bold" />
                </Link>
              )}
            </nav>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/** A Leader Portal entry, highlighted when the workspace is showing it. */
function portalLinkClass(pathname: string, marker: string) {
  const active = pathname.startsWith(marker.split("?")[0]) && pathname !== "/";
  return `flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
    active ? "bg-[#26352f] text-white shadow-sm" : "text-[#26352f] hover:bg-[#dfd9cb]"
  }`;
}
