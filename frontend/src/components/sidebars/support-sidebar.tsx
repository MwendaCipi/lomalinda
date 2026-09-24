"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { stewardshipLinks } from "@/config/site-sections";

export function SupportSidebar() {
  const pathname = usePathname();

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
            const normalized = (pathname ?? "").replace(/\/+$/, "") || "/";
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
      </div>
    </aside>
  );
}
