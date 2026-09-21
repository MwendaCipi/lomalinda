"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Book, ChevronRight, Users, Baby, Music } from "lucide-react";

export type MaterialSection = "hymnals" | "bible-egw" | "adult-weekly" | "children-weekly";

export const materialSections: { value: MaterialSection; label: string; description: string; icon: typeof Book }[] = [
  { value: "hymnals", label: "Hymnals", description: "SDA Church Hymnal and Nyimbo za Kristo lyrics and song search for worship.", icon: Music },
  { value: "bible-egw", label: "Bible & EGW", description: "Holy Scriptures and Spirit of Prophecy writings for worship and study.", icon: Book },
  { value: "adult-weekly", label: "Adult Weekly", description: "Current Sabbath School lesson guides and world mission reports for adults and youth.", icon: Users },
  { value: "children-weekly", label: "Children Weekly", description: "Age-appropriate lesson guides and mission stories for kids across all age groups.", icon: Baby },
];

export function MaterialsSidebar() {
  const searchParams = useSearchParams();
  const active = (searchParams.get("section") as MaterialSection) || "bible-egw";

  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#dfdbd1] bg-[#ede8dc] lg:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] space-y-5 overflow-y-auto p-5 scrollbar-thin">
        <div className="border-b border-[#dfdbd1] pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#b36b3c]">Study Materials</p>
          <p className="mt-1 text-xs text-[#617068]">Sabbath School lessons, mission readings, scripture &amp; E.G. White writings.</p>
        </div>
        <nav>
          <div className="space-y-1">
            {materialSections.map((section) => {
              const Icon = section.icon;
              const isActive = active === section.value;
              return (
                <Link key={section.value} href={`/materials/?section=${section.value}`} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-[#26352f] text-white shadow-sm" : "text-[#26352f] hover:bg-[#f7f4ee]"}`}>
                  <div className="flex items-center gap-3 truncate"><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{section.label}</span></div>
                  {isActive && <ChevronRight className="h-4 w-4 font-bold" />}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </aside>
  );
}

export function MaterialsMobileCards() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("section") as MaterialSection | null;
  const active: MaterialSection = raw && materialSections.some((s) => s.value === raw) ? raw : pathname.startsWith("/materials/hymnal") ? "hymnals" : "bible-egw";

  return (
    <div className="mb-5 lg:hidden">
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-[#b36b3c]">Study Materials</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {materialSections.map((section) => {
          const Icon = section.icon;
          const isActive = active === section.value;
          return (
            <Link key={section.value} href={`/materials/?section=${section.value}`} className={`flex items-start gap-3 rounded-2xl border p-4 shadow-sm transition ${isActive ? "border-[#b36b3c] bg-[#b36b3c]/5 ring-1 ring-[#b36b3c]" : "border-[#dfdbd1] bg-white hover:border-[#b36b3c]"}`}>
              <span className={`shrink-0 rounded-xl p-2 ${isActive ? "bg-[#b36b3c]/10" : "bg-[#f7f4ee]"}`}><Icon className={`h-4 w-4 ${isActive ? "text-[#b36b3c]" : "text-[#617068]"}`} /></span>
              <span className="min-w-0"><span className="block text-sm font-bold text-[#26352f]">{section.label}</span><span className="mt-0.5 block text-[11px] leading-relaxed text-[#617068]">{section.description}</span></span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
