"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Megaphone, Calendar, BookOpen, ChevronRight } from "lucide-react";

const announcementLinks = [
  { href: "/announcements", label: "All Announcements", icon: Megaphone },
  { href: "/calendar", label: "Events Calendar", icon: Calendar },
  { href: "/share/services", label: "Order of Service", icon: BookOpen },
];

export function AnnouncementsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#dfdbd1] bg-[#ede8dc] lg:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] space-y-6 overflow-y-auto p-5 scrollbar-thin">
        <div className="border-b border-[#dfdbd1] pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#b36b3c]">
            News &amp; Events
          </p>
          <p className="mt-1 text-xs text-[#617068]">
            Weekly bulletins, Sabbath schedule &amp; upcoming events.
          </p>
        </div>

        <nav className="space-y-1.5">
          {announcementLinks.map((item) => {
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
    </aside>
  );
}
