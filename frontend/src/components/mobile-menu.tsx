"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";

import { railFor, railSectionsFor, type RailEntry, type RailItem } from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { useDepartments } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { useRailHere } from "@/hooks/use-rail-location";

/**
 * What the phone's menu sheet is showing.
 *
 * The sheet is not a drawer of the rail: a column written for a desktop is a
 * poor thing to read on a phone, so the same entries open as cards — one
 * level at a time, and only ever the level the member asked for.
 *
 * - `door` — the rail's Leadership rows as cards, with no heading over them.
 *   The tab that opens it is already the leaders' tab, so a heading naming
 *   those rows would be the tab said twice.
 * - `row` — one row's pages as cards: a section's pages, when a tab that names
 *   the section opened the sheet, or one desk's pages, when a card in the door
 *   was tapped. `fromSheet` says the card came from inside the sheet, so there
 *   is a way back to the door; a row a *tab* opened has nowhere behind it and
 *   shows no way back — closing is the way out, and the tab is still there.
 */
export type MenuView =
  | { kind: "door" }
  | { kind: "row"; label: string; fromSheet: boolean };

/**
 * The phone's menu, as cards.
 *
 * Nothing here invents navigation: it is `railFor`, the same registry the rail
 * draws from, so the two can never disagree about who may see what.
 */
export function MobileMenu({
  open,
  view,
  onViewChange,
  onClose,
}: {
  open: boolean;
  /** What the sheet shows; the shell owns it, because its tabs open it too. */
  view: MenuView;
  onViewChange: (view: MenuView) => void;
  onClose: () => void;
}) {
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

  /** The row whose pages are on show, when the sheet is showing a row. */
  const row = view.kind === "row" ? entries.find((entry) => entry.label === view.label) ?? null : null;

  /**
   * The door: the rail's own rows, filed under Leadership — the desks, the
   * ministries and the departments — in the rail's own order. A member who
   * serves in no office is never offered this sheet (the tab is theirs only if
   * they do); were one to reach it, the door shows the rows they do have,
   * flat, rather than an empty sheet.
   */
  const sections = railSectionsFor(entries);
  const leadership = sections.find((section) => section.key === "leadership");
  const doorRows: RailEntry[] =
    leadership && leadership.entries.length > 0 ? leadership.entries : sections.flatMap((section) => section.entries);

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

  const backToDoor = view.kind === "row" && view.fromSheet;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={view.kind === "row" ? view.label : "Menu"}
      className="fixed inset-0 z-50 flex flex-col bg-sand-grain md:hidden"
    >
      <header className="flex items-center justify-between gap-2 border-b border-sand-line px-4 py-3">
        {backToDoor ? (
          <button
            type="button"
            onClick={() => onViewChange({ kind: "door" })}
            className="inline-flex items-center gap-1 rounded-full border border-sand-mute bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Menu
          </button>
        ) : (
          <h2 className="min-w-0 truncate text-base font-bold text-bark">
            {view.kind === "row" ? view.label : "Menu"}
          </h2>
        )}
        {backToDoor && view.kind === "row" && (
          <h2 className="min-w-0 flex-1 truncate text-right text-sm font-bold text-bark">{view.label}</h2>
        )}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {row
            ? (row.items ?? []).map((item) => (
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
              ))
            : doorRows.map((entry) => {
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
                    onClick={() => onViewChange({ kind: "row", label: entry.label, fromSheet: true })}
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
      </div>
    </div>
  );
}
