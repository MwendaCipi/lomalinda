"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Calendar, Baby, Handshake, Sprout, ChevronRight } from "lucide-react";

const requestLinks = [
  { href: "/community/prayer", label: "Prayer Requests", icon: Heart },
  { href: "/community/visitation", label: "Pastoral Visitation", icon: Calendar },
  { href: "/community/child-dedication", label: "Child Dedication", icon: Baby },
  { href: "/enroll", label: "Membership & Transfers", icon: Handshake },
  { href: "/partnerships", label: "Partnership Requests", icon: Sprout },
];

export function RequestsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#dfdbd1] bg-[#ede8dc] lg:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] space-y-6 overflow-y-auto p-5 scrollbar-thin">
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
              (item.href === "/community/prayer" && pathname === "/spiritual/prayer") ||
              (item.href === "/community/visitation" && pathname === "/spiritual/visitation") ||
              (item.href === "/community/child-dedication" && pathname === "/spiritual/child-dedication") ||
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
    </aside>
  );
}
