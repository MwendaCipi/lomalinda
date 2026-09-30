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

/** The segmented strip. `flex` is composed per use site. */
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
 * A page's own sub-navigation: the views of one place.
 *
 * One strip at every width — the views of a page are a handful, and the
 * control switches *within* the page you already opened, so it rides above
 * the content it swaps. (The section's *pages* are a different thing: those
 * are navigation, and on a phone they live in the menu — see MobileMenu.)
 *
 * `sticky` pins the strip — and anything passed as `trailing` — to the top of
 * the scrolling page under a hairline, for a page whose own table scrolls
 * beneath it.
 *
 * The items are toggle buttons (`aria-pressed`) rather than links, because
 * they swap content in place. `SectionNav` below is the other half — the
 * sibling pages of a section, which are links, and which phones get in the
 * menu rather than here.
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
 * A section's pages, as a strip at the top of each of them — tablet and up.
 *
 * These are the rows that used to hang under a rail item: the same list, on
 * the page rather than hidden behind a caret in the sidebar. On a phone the
 * section's pages are not drawn here at all: they are cards in the menu
 * (`MobileMenu`) — behind the tab that names the section, so the section's own
 * tab carries them — and a page opens clean instead of wearing a deck of its
 * own navigation above the content.
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
      <div className={`${stripClass} flex`}>
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
