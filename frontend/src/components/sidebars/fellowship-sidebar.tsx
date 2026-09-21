"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Megaphone, Camera, Sparkles, Lightbulb, ChevronRight } from "lucide-react";

const fellowshipLinks = [
  { href: "/announcements", label: "Announcements", icon: Megaphone },
  { href: "/share/services", label: "Live Services", icon: Camera },
  { href: "/spiritual/testimonies", label: "Testimonies", icon: Sparkles },
  { href: "/support/ideas", label: "Ideas & Suggestions", icon: Lightbulb },
];

export function FellowshipSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#dfdbd1] bg-[#ede8dc] lg:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] space-y-6 overflow-y-auto p-5 scrollbar-thin">
        <div className="border-b border-[#dfdbd1] pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#b36b3c]">
            Fellowship &amp; Community
          </p>
          <p className="mt-1 text-xs text-[#617068]">
            Announcements, live worship services &amp; shared testimonies.
          </p>
        </div>

        <nav className="space-y-1.5">
          {fellowshipLinks.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === "/spiritual/testimonies" && pathname === "/community/testimonies") ||
              (item.href === "/support/ideas" && pathname?.startsWith("/support/ideas"));
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
