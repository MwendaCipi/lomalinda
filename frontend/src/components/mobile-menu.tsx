"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";

import { railFor, railSectionsFor, type RailEntry, type RailItem } from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { useDepartments } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { useRailHere } from "@/hooks/use-rail-location";

/**
 * The phone's menu — the whole map, two levels deep.
 *
 * Level one is the rail's rows as cards, under the rail's own headings
 * (Dashboard, My church, Leadership). Tapping a card that holds several pages
 * opens level two: that section's pages as cards. Tapping a page card opens
 * the page and puts the menu away — a page is never left open under a deck of
 * navigation, which is what an on-page card band amounts to.
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

  /**
   * The section the member drilled into. Stored with the page it was opened
   * on, like the shell's own menu state, so arriving somewhere else shows the
   * sections again rather than leaving a stale section open.
   */
  const [drill, setDrill] = useState<{ at: string; label: string } | null>(null);
  const drilled = drill && drill.at === pathname ? entries.find((e) => e.label === drill.label) ?? null : null;

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

  /** A row holding a single page is that page, so its card goes straight there. */
  const pageOf = (entry: RailEntry): { href: string; label: string } | null => {
    if (entry.href && !entry.items) return { href: entry.href, label: entry.label };
    if (entry.items && entry.items.length === 1) {
      return { href: entry.items[0].href, label: entry.items[0].label };
    }
    return null;
  };

  const isHereItem = (item: RailItem) => here.href !== null && here.href === item.href;

  const cardClass = (current: boolean) =>
    `group flex w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-ember/60 active:scale-[0.99] ${
      current ? "border-ember" : "border-sand-line"
    }`;

  const tile = (Icon: LucideIcon) => (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-ember">
      <Icon size={20} />
    </span>
  );

  const chevron = <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" />;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={drilled ? drilled.label : "Menu"}
      className="fixed inset-0 z-50 flex flex-col bg-sand-grain md:hidden"
    >
      <header className="flex items-center justify-between gap-2 border-b border-sand-line px-4 py-3">
        {drilled ? (
          <button
            type="button"
            onClick={() => setDrill(null)}
            className="inline-flex items-center gap-1 rounded-full border border-sand-mute bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Menu
          </button>
        ) : (
          <h2 className="text-base font-bold text-bark">Menu</h2>
        )}
        {drilled && <h2 className="min-w-0 flex-1 truncate text-right text-sm font-bold text-bark">{drilled.label}</h2>}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-moss transition hover:bg-sand"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* The bar sits above this sheet, so the menu tab is also the way back
          out; the reserve at the foot keeps its height off the last card. */}
      <div className="min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar p-4 pb-24">
        {drilled ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(drilled.items ?? []).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={isHereItem(item) ? "page" : undefined}
                className={cardClass(isHereItem(item))}
              >
                {tile(item.icon)}
                <span className="min-w-0 flex-1 text-sm font-bold text-bark">{item.label}</span>
                {chevron}
              </Link>
            ))}
          </div>
        ) : (
          railSectionsFor(entries).map((section) => (
            <section key={section.key} className="mb-5 last:mb-0">
              <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-moss">{section.label}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {section.entries.map((entry) => {
                  const page = pageOf(entry);
                  const items = entry.items ?? [];
                  const current = page ? here.href === page.href : here.group === entry.label;

                  if (page) {
                    return (
                      <Link
                        key={entry.label}
                        href={page.href}
                        onClick={onClose}
                        aria-current={current ? "page" : undefined}
                        className={cardClass(current)}
                      >
                        {tile(entry.icon)}
                        <span className="min-w-0 flex-1 text-sm font-bold text-bark">{page.label}</span>
                        {chevron}
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={entry.label}
                      type="button"
                      onClick={() => setDrill({ at: pathname, label: entry.label })}
                      className={cardClass(current)}
                    >
                      {tile(entry.icon)}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-bark">{entry.label}</span>
                        {/* What is inside, in the rail's own words — so the
                            card is a decision rather than a guess. */}
                        <span className="mt-0.5 block truncate text-xs text-moss">
                          {items.map((item) => item.short ?? item.label).join(" · ")}
                        </span>
                      </span>
                      {chevron}
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
