"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { normalizePath } from "@/lib/paths";
import { Heart, Calendar, Baby, Handshake, ChevronRight } from "lucide-react";

// Prayer and visitation are one desk now — a single merged page holds both
// forms and both ledgers. Dedication and membership complete the walk-with-you
// set; partnership requests were retired.
const requestLinks = [
  { href: "/community/prayer-visitation", label: "Prayer & Visitation Requests", icon: Heart },
  { href: "/community/child-dedication", label: "Child Dedication", icon: Baby },
  { href: "/enroll", label: "Membership", icon: Handshake },
];

export function RequestsSidebar() {
  const pathname = normalizePath(usePathname());

  return (
    <aside className="hidden h-full min-h-0 w-60 shrink-0 border-r border-[#dfdbd1] bg-[#ede8dc] lg:block">
      <div className="h-full min-h-0 space-y-6 overflow-y-auto p-5 scrollbar-thin">
        <div className="border-b border-[#dfdbd1] pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#b36b3c]">
            Requests &amp; Care
          </p>
          <p className="mt-1 text-xs text-[#617068]">
            Submit prayer requests, visitation forms, dedication requests, or membership transfers.
          </p>
        </div>

        <nav className="space-y-1.5">
          {requestLinks.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === "/community/prayer-visitation" &&
                (pathname === "/community/prayer" || pathname === "/community/visitation")) ||
              (item.href === "/enroll" && pathname?.startsWith("/enroll"));
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
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {isActive && <ChevronRight className="h-4 w-4 shrink-0 font-bold" />}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
