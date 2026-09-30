"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { entryHref, railFor, railSectionsFor } from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { useDepartments } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { useRailHere } from "@/hooks/use-rail-location";

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

  const departments = useDepartments();
  const entries = railFor(roles, departments);
  const here = useRailHere(pathname, entries);

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

      {/* The rail scrolls on its own; the page never moves with it. The
          headings are a reading aid — Dashboard, then the church's life, then
          the desks — not a click target and not a group to expand. */}
      <div className="min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar px-3 py-3">
        <nav>
          {railSectionsFor(entries).map((section, index) => (
            <div key={section.key} className={index === 0 ? "" : "mt-4"}>
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-moss">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.entries.map((entry) => {
                  const href = entryHref(entry);
                  if (!href) return null;
                  const Icon = entry.icon;
                  // A row is "here" when it is the section you are in — whatever
                  // page of it you are on — or the single page it links to.
                  const active = here.group === entry.label || here.href === href;
                  return (
                    <Link
                      key={entry.label}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        active ? "bg-bark text-white shadow-sm" : "text-bark hover:bg-sand"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{entry.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
