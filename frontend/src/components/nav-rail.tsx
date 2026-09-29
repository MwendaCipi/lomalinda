"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, X } from "lucide-react";

import { railFor, railHere, type RailEntry, type RailItem } from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { useHeaderData } from "@/hooks/use-header-data";
import { NavIdentity } from "./nav-identity";

/**
 * The rail — the app's navigation, in one column.
 *
 * One rail, everywhere: desktop shows it beside the page, a phone slides it in
 * as a drawer. It is the only navigation in the app, which is why a section
 * never opens a second sidebar and no page draws navigation of its own.
 *
 * A row either *is* a page or *holds* pages:
 *
 * - a row with pages expands in place when it is tapped; the pages inside it
 *   are what navigate. A row that is a single page is simply a link.
 * - the group you are in opens itself on arrival, only one group is open at a
 *   time (the rail scrolls instead of growing), and the open group is scrolled
 *   into view — so the rail always shows where you are.
 */
export function NavRail({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = normalizePath(usePathname());
  const { me } = useHeaderData();
  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];

  /**
   * The console's `?tab=`, read from the address bar rather than through
   * `useSearchParams` — the rail is drawn on every page, including pages that
   * are prerendered, and reading the location directly keeps those pages
   * static. Because Next's client navigation writes the URL through the
   * history API without firing `popstate`, the two writers are wrapped for as
   * long as the rail is mounted: clicking another console page updates the
   * highlight in the same breath as the page.
   */
  const [tab, setTab] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setTab(new URLSearchParams(window.location.search).get("tab"));
    read();
    window.addEventListener("popstate", read);

    const { pushState, replaceState } = history;
    history.pushState = function patchedPushState(...args: Parameters<History["pushState"]>) {
      pushState.apply(this, args);
      read();
    };
    history.replaceState = function patchedReplaceState(...args: Parameters<History["replaceState"]>) {
      replaceState.apply(this, args);
      read();
    };

    return () => {
      window.removeEventListener("popstate", read);
      history.pushState = pushState;
      history.replaceState = replaceState;
    };
  }, [pathname]);

  const entries = railFor(roles);
  const here = railHere(pathname, tab, entries);

  /**
   * The group the member opened or closed by hand, and the group they were
   * looking at when they did it. Kept as an override rather than synced from
   * the pathname in an effect, so arriving on a page derives the open group
   * during render and the rail never paints the previous page's group.
   */
  const [toggled, setToggled] = useState<{ from: string | null; open: string | null } | null>(null);
  const openLabel = toggled && toggled.from === here.group ? toggled.open : here.group;

  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // The phone's drawer closes itself on arrival: the tap did its job.
  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // The open group is scrolled into view, so the rail shows where you are
  // without the member hunting for it. DOM only — no state to settle.
  useEffect(() => {
    if (!here.group) return;
    groupRefs.current[here.group]?.scrollIntoView({ block: "nearest" });
  }, [here.group]);

  const toggle = (label: string) => {
    setToggled((current) => {
      const open = current && current.from === here.group ? current.open : here.group;
      return { from: here.group, open: open === label ? null : label };
    });
  };

  const isHere = (item: RailItem) => here.href !== null && here.href === item.href;

  return (
    <>
      {/* Scrim: the drawer is modal, so a tap outside it puts it away. */}
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-bark/50 backdrop-blur-xs lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] shrink-0 flex-col border-r border-sand-line bg-sand-grain transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-64 lg:max-w-none lg:translate-x-0 ${
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
        aria-label="Navigation"
      >
        {/* Brand — the way home, at the head of the rail. */}
        <div className="flex items-center justify-between border-b border-sand-line px-4 py-3.5">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-bark p-1">
              <Image src="/adventist-symbol.svg" alt="SDA Church" width={32} height={32} className="h-full w-auto object-contain" priority />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm leading-tight tracking-tight text-bark">SDA Church</span>
              <span className="block truncate text-[11px] leading-tight text-moss">Loma Linda</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-moss transition hover:bg-sand lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* The rail scrolls on its own; the page never moves with it. */}
        <div className="min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar px-3 py-3">
          <nav className="space-y-0.5">
            {entries.map((entry) => (
              <RailRow
                key={entry.label}
                entry={entry}
                open={openLabel === entry.label}
                here={here.href}
                onToggle={() => toggle(entry.label)}
                isHere={isHere}
                registerRef={(node) => {
                  groupRefs.current[entry.label] = node;
                }}
              />
            ))}
          </nav>
        </div>

        <div className="border-t border-sand-line p-3">
          <NavIdentity />
        </div>
      </aside>
    </>
  );
}

function RailRow({
  entry,
  open,
  here,
  onToggle,
  isHere,
  registerRef,
}: {
  entry: RailEntry;
  open: boolean;
  here: string | null;
  onToggle: () => void;
  isHere: (item: RailItem) => boolean;
  registerRef: (node: HTMLDivElement | null) => void;
}) {
  const Icon = entry.icon;
  const items = entry.items ?? [];
  const groupActive = items.some(isHere);
  const single = items.length === 1 && !entry.href;

  // A row that holds one page is that page: no caret, no expansion.
  if (single) {
    const only = items[0];
    return (
      <Link
        href={only.href}
        aria-current={isHere(only) ? "page" : undefined}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
          isHere(only) ? "bg-bark text-white shadow-sm" : "text-bark hover:bg-sand"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{entry.label}</span>
      </Link>
    );
  }

  // A plain page: the row is the destination.
  if (entry.href && !entry.items) {
    const active = here === entry.href;
    return (
      <Link
        href={entry.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
          active ? "bg-bark text-white shadow-sm" : "text-bark hover:bg-sand"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{entry.label}</span>
      </Link>
    );
  }

  return (
    <div ref={registerRef}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
          groupActive && !open ? "bg-bark/5 text-bark" : "text-bark hover:bg-sand"
        }`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${groupActive ? "text-ember" : ""}`} />
        <span className="min-w-0 flex-1 truncate text-left">{entry.label}</span>
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-moss transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <ul className="mb-1 mt-0.5 space-y-0.5 pl-4">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isHere(item) ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg border-l-2 py-1.5 pl-3 pr-2 text-xs font-medium transition ${
                  isHere(item)
                    ? "border-ember bg-white font-semibold text-bark"
                    : "border-sand-line text-moss hover:border-ember hover:text-bark"
                }`}
              >
                <span className="truncate">{item.short ?? item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
