"use client";

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

/**
 * A page's own sub-navigation: the views of one place, as a segmented strip at
 * the top of the page.
 *
 * The rail says which *place* you are in; this says which *view* of it. It
 * belongs on the page rather than under the rail's row, because the sibling
 * views are then one tap away with the current one marked — no round trip
 * through the menu to get from a department's roll to its calendar. Every desk
 * draws the same strip, so two views of the same shape never look like two
 * different controls.
 *
 * `sticky` pins the strip — and anything passed as `trailing` — to the top of
 * the scrolling page under a hairline, which is what a desk wants: the views
 * stay reachable while the table beneath them scrolls.
 *
 * The strip is a group of toggle buttons (`aria-pressed`) rather than
 * `role="tab"`: the views are swapped in place with no linked panel elements
 * to announce, and this is the same contract the app's other segmented
 * controls already keep. `help` becomes the button's tooltip, so the reason
 * for a view travels with the control.
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
    <div
      role="group"
      aria-label={label}
      className="flex h-10 w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-sand-line bg-sand p-0.5 sm:w-auto sm:shrink-0"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-pressed={active}
            title={item.help}
            className={`flex h-9 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition sm:flex-none ${
              active ? "bg-bark text-white shadow-sm" : "text-moss hover:text-bark"
            }`}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {item.label}
            {typeof item.count === "number" ? (
              <span className={`text-[10px] font-bold ${active ? "text-white/70" : "text-moss-faint"}`}>
                {item.count}
              </span>
            ) : null}
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
