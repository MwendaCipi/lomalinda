"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Mail, Search, UserPlus } from "lucide-react";

import { entryHref, railFor, railSectionsFor } from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { useAllDepartments, useMyDepartments, useMyTies } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { useRailHere } from "@/hooks/use-rail-location";
import { AreaJoinModal, AreaContactModal } from "./area-modals";

/**
 * The rail — the app's navigation, in one column.
 *
 * One rail, everywhere: it stands beside the page and is the desktop's only
 * navigation, which is why a section never opens a second sidebar and no page
 * draws navigation of its own.
 *
 * Every row is a *place*, and the rail lists only places. A section's pages no
 * longer hang under its row as a tree of carets: they are the strip at the top
 * of each of them (`SectionNav`, drawn by the shell), so the rail stays a
 * short, scannable list of where you can be and every page still shows its
 * siblings one tap away. A phone does not get a narrower column to read — its
 * tab bar carries the top rows and the console's own cards carry the desks.
 */
export function NavRail() {
  const pathname = normalizePath(usePathname());
  const { me } = useHeaderData();
  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];

  // The whole directory, not just the member's own areas: the rail needs the
  // ministries they could still join for the folded heading, and the rows are
  // cached beside the member's own.
  const departments = useAllDepartments();
  const myDepartments = useMyDepartments();
  const myTies = useMyTies();
  const entries = railFor(
    { roles, departmentCodes: myDepartments, tieCodes: myTies, sex: me?.gender },
    departments
  );
  const here = useRailHere(pathname, entries);

  // The join and contact affordances: which heading's modal is open.
  const [joinArea, setJoinArea] = useState<string | null>(null);
  const [contactArea, setContactArea] = useState<string | null>(null);
  // The rail's own search — it holds the slot the Dashboard row gave up, since
  // the logo above already is the way home. It narrows the rows below: a
  // section's own name, or the pages a section row carries.
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = (row: { label: string; short?: string; description?: string }) =>
    `${row.label} ${row.short ?? ""} ${row.description ?? ""}`.toLowerCase().includes(needle);
  const sections = railSectionsFor(entries)
    .map((section) => ({
      ...section,
      entries: needle
        ? section.entries.flatMap((entry) =>
            matches(entry)
              ? [entry]
              : "items" in entry && entry.items
                ? entry.items.filter(matches)
                : []
          )
        : section.entries,
    }))
    .filter((section) => section.entries.length > 0);

  return (
    <aside
      className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sand-line bg-sand-grain lg:flex"
      aria-label="Navigation"
    >
      {/* Brand — the way home, at the head of the rail. It wears the same
          `bark` chrome as the identity bar beside it (`h-16` in AppTopBar) and
          the same light inks, so the two read as one band across the app and
          their bottom hairlines meet at a single continuous line. */}
      <div className="flex h-16 items-center justify-between border-b border-white/10 bg-bark px-4">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 p-1">
            <Image src="/adventist-symbol.svg" alt="SDA Church" width={32} height={32} className="h-full w-auto object-contain" priority />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm leading-tight tracking-tight text-white">SDA Church</span>
            <span className="block truncate text-[11px] leading-tight text-white/70">Loma Linda</span>
          </span>
        </Link>
      </div>

      {/* The rail's own search, in the slot the Dashboard row gave up: the
          logo above is the way home, so the space goes to finding a place.
          It narrows the rows below while there is something typed. */}
      <div className="shrink-0 border-b border-sand-line px-3 py-2.5">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moss" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search the rail"
            placeholder="Search the rail…"
            className="w-full rounded-xl border border-sand-line bg-white py-2 pl-8 pr-3 text-xs text-bark outline-none placeholder:text-moss focus:border-ember"
          />
        </label>
      </div>

      {/* The rail scrolls on its own; the page never moves with it. The
          headings are a reading aid — the church's life, then the areas the
          member belongs to, then the rest — plain labels with their rows
          beneath them, none of them folded away. */}
      <div className="min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar px-3 py-3">
        <nav>
          {sections.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-moss">
              Nothing in the rail matches “{query.trim()}”.
            </p>
          )}
          {sections.map((section, index) => (
            <div key={section.key} className={index === 0 ? "" : "mt-4"}>
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-moss">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.entries.map((entry) => {
                  const href = entryHref(entry);
                  // A heading the member belongs to nothing under renders a
                  // quiet invitation instead of rows: ask to join, or reach
                  // the area's leader directly.
                  if ("memberJoin" in entry) {
                    return (
                      <div key={entry.label} className="space-y-1 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-moss">
                          <entry.icon className="h-3.5 w-3.5 shrink-0" />
                          <span>Nothing here yet</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setJoinArea(entry.label)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-bark px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-ember"
                        >
                          <UserPlus className="h-3.5 w-3.5" /> Request to join
                        </button>
                        <button
                          type="button"
                          onClick={() => setContactArea(entry.label)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sand-line bg-white px-2.5 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                        >
                          <Mail className="h-3.5 w-3.5" /> Contact department
                        </button>
                      </div>
                    );
                  }
                  if (!href) return null;
                  const Icon = entry.icon;
                  // A row is "here" when it is the section you are in — whatever
                  // page of it you are on — or the single page it links to.
                  const active = here.group === entry.label || here.href === href;
                  // The short form is the rail's own: a 256px column reads
                  // "AMM" where the desk's page heading keeps the full name.
                  const shown = entry.short ?? entry.label;
                  return (
                    <Link
                      key={entry.label}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      title={entry.short ? entry.label : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        active ? "bg-bark text-white shadow-sm" : "text-bark hover:bg-sand"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{shown}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <AreaJoinModal open={joinArea !== null} area={joinArea} onClose={() => setJoinArea(null)} />
      <AreaContactModal open={contactArea !== null} area={contactArea} onClose={() => setContactArea(null)} />
    </aside>
  );
}
