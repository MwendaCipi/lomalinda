"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Target, BarChart3, TrendingUp, ChevronRight, FileText, Gift } from "lucide-react";

const supportLinks = [
  { href: "/give", label: "Money Giving", icon: CreditCard },
  { href: "/support/in-kind", label: "In-Kind Giving", icon: Gift },
  { href: "/support/campaigns", label: "Fund Drives", icon: Target },
  { href: "/support/budget", label: "Church Budget", icon: BarChart3 },
  { href: "/support/reports", label: "Live Reports", icon: TrendingUp },
  { href: "/support/periodical-reports", label: "Periodic Reports", icon: FileText },
];

export function SupportSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#dfdbd1] bg-[#ede8dc] lg:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] space-y-6 overflow-y-auto p-5 scrollbar-thin">
        <div className="border-b border-[#dfdbd1] pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#b36b3c]">
            Stewardship &amp; Support
          </p>
          <p className="mt-1 text-xs text-[#617068]">
            Support church operations, building projects &amp; view finances.
          </p>
        </div>

        <nav className="space-y-1.5">
          {supportLinks.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === "/give" && pathname === "/support/give") ||
              (item.href === "/support/campaigns" &&
                (pathname?.startsWith("/support/campaigns") || pathname?.startsWith("/campaigns")));
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
