"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MINISTRIES } from "@/config/ministries";
import { Users, ChevronRight } from "lucide-react";

interface MinistrySidebarProps {
  currentSlug?: string;
}

export function MinistrySidebar({ currentSlug }: MinistrySidebarProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsLoggedIn(Boolean(localStorage.getItem("access_token")));
    }
  }, []);

  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#dfdbd1] bg-white lg:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] space-y-6 overflow-y-auto p-5 scrollbar-thin">
        <div className="border-b border-[#dfdbd1] pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#b36b3c]">
            Church Ministries
          </p>
          <p className="mt-1 text-xs text-[#617068]">
            Select a ministry to explore programs &amp; schedules.
          </p>
        </div>

        <nav className="space-y-1.5">
          {MINISTRIES.map((m) => {
            const isActive = currentSlug === m.slug;
            return (
              <Link
                key={m.slug}
                href={`/ministries/${m.slug}`}
                className={`flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition ${
                  isActive
                    ? "bg-[#26352f] text-white shadow-sm"
                    : "text-[#26352f] hover:bg-[#f7f4ee]"
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <Users className="h-4 w-4 shrink-0" />
                  <span className="truncate">{m.title}</span>
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
