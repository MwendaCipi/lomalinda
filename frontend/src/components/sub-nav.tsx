"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** One view of a page, as its sub-navigation names it. */
export type SubNavItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** A count shown beside the label — how much the view holds. */
  count?: number;
  /** A longer explanation, surfaced as the tab's tooltip. */
  help?: string;
};

/** One page of a section, as the section's own strip names it. */
export type SectionNavItem = SubNavItem & { href: string };

const stripClass =
  "flex h-10 w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-sand-line bg-sand p-0.5 sm:w-auto sm:shrink-0";

const tabClass = (active: boolean) =>
  `flex h-9 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition sm:flex-none ${
    active ? "bg-bark text-white shadow-sm" : "text-moss hover:text-bark"
  }`;

/** The inside of a tab — the mark, the name and any count. */
function TabBody({ item, active }: { item: SubNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <>
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {item.label}
      {typeof item.count === "number" ? (
        <span className={`text-[10px] font-bold ${active ? "text-white/70" : "text-moss-faint"}`}>{item.count}</span>
      ) : null}
    </>
  );
}

/**
 * A page's own sub-navigation: the views of one place, as a segmented strip.
 *
 * The rail says which *place* you are in; this says which *view* of it. The
 * strip is built once and drawn everywhere, so two views of the same shape
 * never look like two different controls.
 *
 * `sticky` pins the strip — and anything passed as `trailing` — to the top of
 * the scrolling page under a hairline, for a page whose own table scrolls
 * beneath it.
 *
 * This variant switches *within* a page: the items are toggle buttons
 * (`aria-pressed`) rather than links, because they swap content in place.
 * `SectionNav` below is the other half — the sibling pages of a section, which
 * are links.
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
  const strip = (
    <div role="group" aria-label={label} className={stripClass}>
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
  );

  if (!sticky) {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        {strip}
        {trailing}
      </div>
    );
  }

  /* The band carries its own background so the rows scrolling beneath it never
     show through the strip, and its own hairline so the pinned edge reads as a
     boundary rather than a floating control. */
  return (
    <div
      className={`sticky top-0 z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-sand-line bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6 ${className}`}
    >
      {strip}
      {trailing}
    </div>
  );
}

/**
 * A section's pages, as the strip that sits at the top of each of them.
 *
 * These are the rows that used to hang under a rail item: the same list, on
 * the page rather than hidden behind a caret in the sidebar. Every page of the
 * section draws it, so the sibling pages are one tap away with the current one
 * marked — and the rail stays a short list of places instead of a tree.
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
  return (
    <nav aria-label={label} className={`${stripClass} ${className}`}>
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
    </nav>
  );
}
