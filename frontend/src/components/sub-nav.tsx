"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** One view of a page, as its sub-navigation names it. */
export type SubNavItem = {
  key: string;
  label: string;
  /** A one-worder for a phone's width, where the full name will not fit. */
  short?: string;
  icon?: LucideIcon;
  /** A count shown beside the label — how much the view holds. */
  count?: number;
  /** A longer explanation, surfaced as the tab's tooltip. */
  help?: string;
};

/** One page of a section, as the section's own strip names it. */
export type SectionNavItem = SubNavItem & { href: string };

/** The segmented strip. Independent buttons: no pill around them. On a phone
 *  the strip wraps into rows rather than scrolling sideways — a chip pushed
 *  off-screen is a page the member does not know exists, so every view stays
 *  in sight, and the desk-sized widths keep the one-row scroll. */
const stripClass =
  "min-h-12 w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap sm:shrink-0 sm:overflow-x-auto";

/** The section strip's phone layout once it is long enough to wrap anyway:
 *  an equal-share grid, three across — Giving's six pages land as two
 *  level rows of three instead of a wrap that follows each label's length.
 *  Shorter strips keep the natural wrap, which still fits them on one row. */
const sectionGridClass =
  "grid min-h-12 w-full grid-cols-3 items-stretch gap-1.5 sm:flex sm:w-auto sm:flex-nowrap sm:shrink-0 sm:overflow-x-auto";

const tabClass = (active: boolean) =>
  `flex h-10 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition sm:flex-none ${
    active ? "bg-bark text-white shadow-sm" : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
  }`;

/** The inside of a strip tab — the name and any count, no icon. A tab with a
    `short` says the one-worder on a phone and the full name everywhere else,
    so a strip can carry "Fund Drives" on a desk and "Drives" in a hand. */
function TabBody({ item, active }: { item: SubNavItem; active: boolean }) {
  return (
    <>
      {item.short ? (
        <>
          <span className="sm:hidden">{item.short}</span>
          <span className="hidden sm:inline">{item.label}</span>
        </>
      ) : (
        item.label
      )}
      {typeof item.count === "number" ? (
        <span className={`text-xs font-bold ${active ? "text-white/70" : "text-moss-faint"}`}>{item.count}</span>
      ) : null}
    </>
  );
}

/**
 * A page's own sub-navigation: the views of one place.
 *
 * One strip at every width — the views of a page are a handful, and the
 * control switches *within* the page you already opened, so it rides above
 * the content it swaps. (The section's *pages* are a different thing: those
 * are navigation, and they are the strip the shell draws above this page.)
 *
 * On a phone the chips wrap into rows instead of scrolling away, so nothing
 * a page offers is hiding past the edge.
 *
 * `sticky` pins the strip — and anything passed as `trailing` — to the top of
 * the scrolling page under a hairline, for a page whose own table scrolls
 * beneath it.
 *
 * The items are toggle buttons (`aria-pressed`) rather than links, because
 * they swap content in place. `SectionNav` below is the other half — the
 * sibling pages of a section, which are links.
 */
export function SubNav({
  items,
  value,
  onChange,
  label,
  sticky = false,
  trailing,
  className = "",
}: {
  items: readonly SubNavItem[];
  value: string;
  onChange: (key: string) => void;
  /** Names the group for a screen reader, e.g. "Department views". */
  label: string;
  sticky?: boolean;
  /** Controls that ride the strip's band — a count, an action. */
  trailing?: React.ReactNode;
  className?: string;
}) {
  const band = sticky
    ? "flex shrink-0 flex-wrap items-center gap-2 px-4 py-3 sm:px-6 md:sticky md:top-0 md:z-20 md:border-b md:border-sand-line md:bg-white/95 md:backdrop-blur-sm"
    : "flex shrink-0 flex-wrap items-center gap-2";

  return (
    <div className={`${band} ${className}`}>
      <div role="group" aria-label={label} className={`${stripClass} flex`}>
        {items.map((item) => {
          const active = item.key === value;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              aria-pressed={active}
              title={item.help}
              className={tabClass(active)}
            >
              <TabBody item={item} active={active} />
            </button>
          );
        })}
      </div>
      {trailing}
    </div>
  );
}

/**
 * A section's pages, as a strip at the top of each of them — every width.
 *
 * These are the rows that used to hang under a rail item: the same list, on
 * the page rather than hidden behind a caret in the sidebar. A phone shows
 * the same strip wrapped into rows — nothing rides out of sight — and a page
 * opens clean. A strip long enough to wrap (Giving's six pages) shares
 * the width equally instead, three chips a row.
 */
export function SectionNav({
  items,
  activeHref,
  label,
  className = "",
}: {
  items: readonly SectionNavItem[];
  /** The current page's href, as the navigation model spells it. */
  activeHref: string | null;
  label: string;
  className?: string;
}) {
  // Three or fewer pages fit a phone on one natural row; from four up the
  // strip wraps anyway, so it switches to the equal-share grid instead.
  const phoneGrid = items.length > 3;
  return (
    <nav aria-label={label} className={className}>
      {/* The grid class carries its own display (`grid`, `sm:flex`); the
          natural-wrap fallback still needs `flex` appended. */}
      <div className={phoneGrid ? sectionGridClass : `${stripClass} flex`}>
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.help}
              className={tabClass(active)}
            >
              <TabBody item={item} active={active} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
