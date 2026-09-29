"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { normalizePath } from "@/lib/paths";
import { ChevronRight, Download } from "lucide-react";
import {
  destinationOf,
  isActive,
  memberWorkspaceKeys,
} from "@/config/navigation";
import { triggerPwaInstall } from "../pwa-register";

/**
 * The member workspace rail.
 *
 * Its links come from the nav registry (`memberWorkspaceKeys`), so the rail
 * cannot rename a place or point somewhere the bars and tiles do not — it
 * lists the dashboard, the member's own account pages and the two care desks,
 * and it stays mounted on every one of them (including the dashboard, which it
 * leads with).
 */
export function MemberSidebar() {
  const pathname = normalizePath(usePathname());

  return (
    <aside className="hidden h-full min-h-0 w-60 shrink-0 border-r border-sand-line bg-sand-grain lg:block">
      <div className="h-full min-h-0 flex flex-col justify-between p-5 overflow-y-auto custom-hover-scrollbar scrollbar-thin">
        <div className="space-y-6">
          <div className="border-b border-sand-line pb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ember">
              Member Workspace
            </p>
            <p className="mt-1 text-xs text-moss">
              Manage profile details, giving history &amp; church engagement.
            </p>
          </div>

          <nav className="space-y-1.5">
            {memberWorkspaceKeys.map((key) => {
              const dest = destinationOf(key);
              const Icon = dest.icon;
              const active = isActive(dest, pathname);
              return (
                <Link
                  key={dest.href}
                  href={dest.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition ${
                    active
                      ? "bg-bark text-white shadow-sm"
                      : "text-bark hover:bg-sand"
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Icon className="h-4 w-4 shrink-0" />
                    {/* The rail is 240px wide: it takes the registry's short
                        label where one exists, never a name of its own. */}
                    <span className="truncate">{dest.short ?? dest.label}</span>
                  </div>
                  {active && <ChevronRight className="h-4 w-4 font-bold" />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-sand-line">
          <button
            type="button"
            onClick={triggerPwaInstall}
            className="w-full flex items-center justify-between rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-xs font-semibold text-bark hover:bg-sand transition shadow-xs"
          >
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-ember" />
              <span>Install App</span>
            </div>
            <span className="text-[10px] font-bold text-ember">PWA</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
