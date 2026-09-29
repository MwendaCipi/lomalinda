"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
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

/** The segmented strip, from tablet up. `flex` is composed per use site. */
const stripClass =
  "h-12 w-full items-center gap-1 overflow-x-auto rounded-xl border border-sand-line bg-sand p-1 sm:w-auto sm:shrink-0";

const tabClass = (active: boolean) =>
  `flex h-10 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition sm:flex-none ${
    active ? "bg-bark text-white shadow-sm" : "text-moss hover:text-bark"
  }`;

/** The inside of a strip tab — the mark, the name and any count. */
function TabBody({ item, active }: { item: SubNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <>
      {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {item.label}
      {typeof item.count === "number" ? (
        <span className={`text-xs font-bold ${active ? "text-white/70" : "text-moss-faint"}`}>{item.count}</span>
      ) : null}
    </>
  );
}

/**
 * The card a phone shows instead of a strip tab: mark, name, count and a
 * chevron, big enough for a thumb and always fully on screen. A thumb cannot
 * reliably hit a scrolled sliver of text at the strip's edge — and a horizontal
 * strip hides every sibling that did not fit, which is the one thing
 * navigation must never do.
 */
const cardClass = (active: boolean) =>
  `group flex items-center gap-3 rounded-2xl border p-3.5 shadow-xs transition ${
    active ? "border-ember/60 bg-ember/5" : "border-sand-line bg-white hover:border-ember/50"
  }`;

function CardBody({ item, active }: { item: SubNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <>
      {Icon ? (
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            active ? "bg-ember/15 text-ember" : "bg-sand text-moss"
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-bark">{item.label}</span>
      {typeof item.count === "number" ? (
        <span className={`shrink-0 text-[10px] font-bold ${active ? "text-ember" : "text-moss-faint"}`}>
          {item.count}
        </span>
      ) : null}
      <ChevronRight
        className={`h-4 w-4 shrink-0 ${active ? "text-ember" : "text-sand-mute"}`}
        aria-hidden="true"
      />
    </>
  );
}

/**
 * A page's own sub-navigation: the views of one place.
 *
 * The rail says which *place* you are in; this says which *view* of it. The
 * control is built once and drawn everywhere, so two views of the same shape
 * never look like two different controls.
 *
 * `sticky` pins the strip — and anything passed as `trailing` — to the top of
 * the scrolling page under a hairline, for a page whose own table scrolls
 * beneath it. Pinning is a tablet-and-up behaviour: on a phone the cards
 * scroll with the page, because a pinned grid would eat the screen the cards
 * gave back.
 *
 * This variant switches *within* a page: the items are toggle buttons
 * (`aria-pressed`) rather than links, because they swap content in place.
 * `SectionNav` below is the other half — the sibling pages of a section,
 * which are links.
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
  const cards = (
    <div role="group" aria-label={label} className="grid w-full grid-cols-2 gap-2 md:hidden">
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-pressed={active}
            title={item.help}
            className={cardClass(active)}
          >
            <CardBody item={item} active={active} />
          </button>
        );
      })}
    </div>
  );

  const strip = (
    <div role="group" aria-label={label} className={`${stripClass} hidden md:flex`}>
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
        {cards}
        {strip}
        {trailing}
      </div>
    );
  }

  /* The band carries its own background so the rows scrolling beneath it never
     show through the strip, and its own hairline so the pinned edge reads as a
     boundary rather than a floating control. On a phone nothing is pinned —
     the cards ride the page — so the band's chrome only arms from md up. */
  return (
    <div
      className={`flex shrink-0 flex-wrap items-center gap-2 px-4 py-3 sm:px-6 md:sticky md:top-0 md:z-20 md:border-b md:border-sand-line md:bg-white/95 md:backdrop-blur-sm ${className}`}
    >
      {cards}
      {strip}
      {trailing}
    </div>
  );
}

/**
 * A section's pages, as the navigation that sits at the top of each of them.
 *
 * These are the rows that used to hang under a rail item: the same list, on
 * the page rather than hidden behind a caret in the sidebar. Every page of the
 * section draws it, so the sibling pages are one tap away with the current one
 * marked — and the rail stays a short list of places instead of a tree.
 *
 * Two shapes, one list: on a phone the pages are a grid of cards, nothing
 * hidden off an edge; from tablet up the same list is the segmented strip,
 * where the width exists to show every sibling in one breath.
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
    <nav aria-label={label} className={className}>
      {/* Phones: cards, two to a row, the current page marked. */}
      <div className="grid w-full grid-cols-2 gap-2 md:hidden">
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.help}
              className={cardClass(active)}
            >
              <CardBody item={item} active={active} />
            </Link>
          );
        })}
      </div>
      {/* Tablet and up: the segmented strip. */}
      <div className={`${stripClass} hidden md:flex`}>
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
