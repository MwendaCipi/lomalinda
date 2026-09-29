"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, X } from "lucide-react";

import { entryHref, railFor } from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { useDepartments } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { useRailHere } from "@/hooks/use-rail-location";

/**
 * The phone's Admin menu — the rail as cards.
 *
 * A drawer asks a phone to read a column written for a desktop, so the same
 * map opens as cards the thumb can hit: one card per place, each opening it.
 * The pages inside a place are not listed here any more — they are the strip at
 * the top of each of them (`SectionNav`), which is where a phone needs them:
 * on the page, next to the thing they switch between.
 *
 * Nothing here invents navigation: it is `railFor`, the same registry the rail
 * draws from, so the two can never disagree about who may see what.
 */
export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = normalizePath(usePathname());
  const { me } = useHeaderData();
  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  const departments = useDepartments();
  const entries = railFor(roles, departments);
  const here = useRailHere(pathname, entries);

  // Escape puts the menu away, the way it does for any other overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Admin"
      className="fixed inset-0 z-50 flex flex-col bg-sand-grain md:hidden"
    >
      <header className="flex items-center justify-between gap-2 border-b border-sand-line px-4 py-3">
        <h2 className="text-base font-bold text-bark">Admin</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-moss transition hover:bg-sand"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* The bar sits above this sheet, so "Admin" is also the way back out;
          the reserve at the foot keeps its height off the last card. */}
      <div className="min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar p-4 pb-24">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {entries.map((entry) => {
            const href = entryHref(entry);
            if (!href) return null;
            const Icon = entry.icon;
            const current = here.group === entry.label || here.href === href;
            return (
              <Link
                key={entry.label}
                href={href}
                onClick={onClose}
                aria-current={current ? "page" : undefined}
                className={`group flex w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-ember/60 active:scale-[0.99] ${
                  current ? "border-ember" : "border-sand-line"
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember">
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-bark">{entry.label}</span>
                  {/* What is inside, in the rail's own words — so the card is a
                      decision rather than a guess. */}
                  {entry.items && entry.items.length > 1 ? (
                    <span className="mt-0.5 block truncate text-xs text-moss">
                      {entry.items.map((item) => item.short ?? item.label).join(" · ")}
                    </span>
                  ) : null}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
