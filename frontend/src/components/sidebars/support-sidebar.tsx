"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { stewardshipLinks } from "@/config/site-sections";

/**
 * The stewardship sidebar.
 *
 * Support pages are member-facing — give, in-kind, fund drives, reports — so
 * every signed-in member sees the same five stewardship links, office holders
 * included. Leadership navigation lives in the Leader Portal / admin sidebar,
 * not here.
 */
export function SupportSidebar() {
  const pathname = usePathname();

  const normalized = (pathname ?? "").replace(/\/+$/, "") || "/";

  return (
    <aside className="hidden h-full min-h-0 w-60 shrink-0 border-r border-sand-line bg-sand-grain lg:block">
      <div className="h-full min-h-0 space-y-6 overflow-y-auto p-5 scrollbar-thin">
        <div className="border-b border-sand-line pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ember">
            Stewardship &amp; Support
          </p>
          <p className="mt-1 text-xs text-moss">
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
                    ? "bg-bark text-white shadow-sm"
                    : "text-bark hover:bg-sand"
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
