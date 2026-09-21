"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Calendar, Handshake, ShieldCheck, ChevronRight } from "lucide-react";

const aboutLinks = [
  { href: "/about", label: "About Loma Linda", icon: Building2 },
  { href: "/calendar", label: "Church Calendar", icon: Calendar },
  { href: "/partnerships", label: "Partnerships", icon: Handshake },
  { href: "/privacy", label: "Privacy & Terms", icon: ShieldCheck },
];

export function AboutSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#dfdbd1] bg-[#ede8dc] lg:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] space-y-6 overflow-y-auto p-5 scrollbar-thin">
        <div className="border-b border-[#dfdbd1] pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#b36b3c]">About Loma Linda</p>
          <p className="mt-1 text-xs text-[#617068]">Explore our faith, history, mission, leadership &amp; calendar.</p>
        </div>
        <nav className="space-y-1.5">
          {aboutLinks.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition ${isActive ? "bg-[#26352f] text-white shadow-sm" : "text-[#26352f] hover:bg-[#f7f4ee]"}`}>
                <div className="flex items-center gap-3 truncate"><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{item.label}</span></div>
                {isActive && <ChevronRight className="h-4 w-4 font-bold" />}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
