"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { normalizePath } from "@/lib/paths";
import { LayoutDashboard, User, BarChart3, HeartHandshake, Heart, ChevronRight, Download } from "lucide-react";
import { triggerPwaInstall } from "../pwa-register";

const memberLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/member", label: "My Profile & Status", icon: User },
  { href: "/member/reports", label: "My Giving Statements", icon: BarChart3 },
  { href: "/community/welfare", label: "Member Welfare", icon: HeartHandshake },
  { href: "/community/prayer", label: "Prayer Requests", icon: Heart },
];

export function MemberSidebar() {
  const pathname = normalizePath(usePathname());

  return (
    <aside className="hidden h-full min-h-0 w-60 shrink-0 border-r border-[#dfdbd1] bg-[#ede8dc] lg:block">
      <div className="h-full min-h-0 flex flex-col justify-between p-5 overflow-y-auto custom-hover-scrollbar scrollbar-thin">
        <div className="space-y-6">
          <div className="border-b border-[#dfdbd1] pb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#b36b3c]">
              Member Workspace
            </p>
            <p className="mt-1 text-xs text-[#617068]">
              Manage profile details, giving history &amp; church engagement.
            </p>
          </div>

          <nav className="space-y-1.5">
            {memberLinks.map((item) => {
              const isActive = pathname === item.href;
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
        </div>

        <div className="pt-4 border-t border-[#dfdbd1]">
          <button
            type="button"
            onClick={triggerPwaInstall}
            className="w-full flex items-center justify-between rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#26352f] hover:bg-[#f7f4ee] transition shadow-xs"
          >
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-[#b36b3c]" />
              <span>Install App</span>
            </div>
            <span className="text-[10px] font-bold text-[#b36b3c]">PWA</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
