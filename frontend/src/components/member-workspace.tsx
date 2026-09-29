"use client";

import { MemberSidebar } from "@/components/sidebars/member-sidebar";

/**
 * The member workspace shell: the rail on the left, the page scrolling in its
 * own panel on the right.
 *
 * Every page the rail lists renders through this, so the rail never vanishes
 * when a member taps one of its own links — including the dashboard, which is
 * the rail's first entry. The panel owns its scrolling (the `panel` scroll
 * mode in globals.css), so pages carry no scroll markup of their own; on a
 * phone the rail hides and the document scrolls normally.
 */
export function MemberWorkspace({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen md:h-screen bg-sand text-bark md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <MemberSidebar />
        <div className="flex-1 min-w-0 h-full p-4 sm:p-8 lg:p-10 overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
