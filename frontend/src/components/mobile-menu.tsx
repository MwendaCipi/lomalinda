"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, X, type LucideIcon } from "lucide-react";

import { railFor, railSectionsFor, type RailEntry, type RailItem } from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { useDepartments } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { useRailHere } from "@/hooks/use-rail-location";

/**
 * What the phone's menu sheet is showing.
 *
 * The sheet is the leaders' door and nothing else now: a section's pages ride
 * the strip on the page (AppFrame), so the only cards left are the desks —
 * the rail's Leadership rows, which have no tab of their own to name them.
 */
export type MenuView = { kind: "door" };

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

  /**
   * The page a row's card opens: the row's own page where it has one, else
   * its first page — the section's siblings ride the strip on the page this
   * opens, so the door never needs a second level of its own.
   */
  const pageOf = (entry: RailEntry): { href: string; label: string } => {
    if (entry.href && !entry.items) return { href: entry.href, label: entry.label };
    const first = entry.items?.[0];
    return first
      ? { href: first.href, label: first.label }
      : { href: entry.href ?? "/dashboard", label: entry.label };
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
      aria-label="Menu"
      className="fixed inset-0 z-50 flex flex-col bg-sand-grain md:hidden"
    >
      <header className="flex items-center justify-between gap-2 border-b border-sand-line px-4 py-3">
        <h2 className="min-w-0 truncate text-base font-bold text-bark">Menu</h2>
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
          {doorRows.map((entry) => {
            const page = pageOf(entry);
            const current = here.group === entry.label;

            return (
              <Link
                key={entry.label}
                href={page.href}
                onClick={onClose}
                aria-current={current ? "page" : undefined}
                className={cardClass(current)}
              >
                {tile(entry.icon)}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-bark">{entry.label}</span>
                  {/* Where the card lands, in the rail's own words — the row
                      opens on its first page, and the strip on that page
                      carries the rest of its siblings. */}
                  <span className="mt-0.5 block truncate text-xs text-moss">
                    {(entry.items ?? []).length > 1
                      ? (entry.items ?? []).map((item) => item.short ?? item.label).join(" · ")
                      : page.label}
                  </span>
                </span>
                {chevron}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
