"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ExternalLink,
  Globe,
  Library,
  Lightbulb,
  Music,
  Shapes,
  Sprout,
  type LucideIcon,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * The study materials as flat destinations — the cards the hub shows and the PC
 * sidebar mirrors. No intermediate "choose a study area" step: a member picks
 * what they came to read and the reader opens.
 *
 * Children Lessons is itself a small family, so its card opens a page of the
 * five age-group lessons rather than one reader.
 *
 * Icons are real line icons rather than emoji: the sidebar draws them at 16px
 * beside the label, where an emoji reads as a coloured blob and italicises the
 * row's rhythm.
 */
export type MaterialDestination = {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  isExternal: boolean;
};

export const materialDestinations: MaterialDestination[] = [
  {
    key: "adult-lesson",
    href: `${API_URL}/api/members/lesson-reading/adult/`,
    label: "Adult Lesson",
    description: "The current adult Sabbath School lesson guide, with daily readings and commentary.",
    icon: BookOpen,
    isExternal: true,
  },
  {
    key: "ya-lesson",
    href: `${API_URL}/api/members/lesson-reading/ya/`,
    label: "YA Lesson",
    description: "The Young Adult (YA) lesson series on inverse — conversation-style study for ages 18–35.",
    icon: Lightbulb,
    isExternal: true,
  },
  {
    key: "adult-mission",
    href: `${API_URL}/api/members/mission-reading/adult/`,
    label: "Adult Mission Reading",
    description: "Weekly mission stories from the Adventist Mission quarterlies, youth and adult.",
    icon: Globe,
    isExternal: true,
  },
  {
    key: "children-lessons",
    href: "/materials/children-lessons",
    label: "Children Lessons",
    description: "Lesson guides for every age group — Beginner through Teens. Choose a division inside.",
    icon: Shapes,
    isExternal: false,
  },
  {
    key: "children-mission",
    href: `${API_URL}/api/members/mission-reading/children/`,
    label: "Children Mission Reading",
    description: "Mission stories told for children — prayer, global awareness and faith in Jesus.",
    icon: Sprout,
    isExternal: true,
  },
  {
    key: "bible-egw",
    href: "/materials/bible",
    label: "Bible & EGW",
    description: "Holy Scriptures and the published Spirit of Prophecy writings for study and worship.",
    icon: Library,
    isExternal: false,
  },
  {
    key: "hymnals",
    href: "/materials/hymnal",
    label: "Hymnals",
    description: "The SDA Hymnal and Nyimbo za Kristo — search by title, number or first line.",
    icon: Music,
    isExternal: false,
  },
];

/**
 * The PC sidebar's grouping: the weekly study reads lead (adult and young
 * adult lessons together), the children's weekly study follows, then the
 * mission quarterlies, and the always-open reference shelf last.
 */
export const materialGroups: { label: string; items: MaterialDestination[] }[] = [
  {
    label: "Adult Weekly",
    items: materialDestinations.filter((d) => d.key === "adult-lesson" || d.key === "ya-lesson"),
  },
  {
    label: "Children Weekly",
    items: materialDestinations.filter((d) => d.key === "children-lessons"),
  },
  {
    label: "Mission Stories",
    items: materialDestinations.filter((d) => d.key === "adult-mission" || d.key === "children-mission"),
  },
  {
    label: "Reference",
    items: materialDestinations.filter((d) => d.key === "bible-egw" || d.key === "hymnals"),
  },
];

export function MaterialsDestinationCards({ activeKey }: { activeKey?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {materialDestinations.map((dest) => {
        const isActive = activeKey === dest.key;
        const cls = `group flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 ${
          isActive
            ? "border-[#b36b3c] ring-1 ring-[#b36b3c]"
            : "border-[#dfdbd1] hover:border-[#b36b3c]/50"
        }`;
        const Icon = dest.icon;
        const inner = (
          <>
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                isActive ? "bg-[#b36b3c]/10 text-[#b36b3c]" : "bg-[#f7f4ee] text-[#26352f]"
              }`}
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[#26352f]">{dest.label}</span>
              <span className="mt-0.5 block text-xs leading-5 text-[#617068]">{dest.description}</span>
            </span>
            {dest.isExternal ? (
              <ExternalLink className="h-4 w-4 shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" />
            ) : (
              <span className="shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" aria-hidden="true">
                &rarr;
              </span>
            )}
          </>
        );

        return dest.isExternal ? (
          // Same-tab on purpose: in the installed PWA a new tab has no history
          // to go back to, so the reader's Back gesture closed the app. The
          // backend redirect does not add a history entry, so Back lands on
          // the hub.
          <a key={dest.key} href={dest.href} className={cls}>
            {inner}
          </a>
        ) : (
          <Link key={dest.key} href={dest.href} className={cls}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

/** The PC sidebar: the same destinations the hub's cards show, in groups. */
export function MaterialsSidebar() {
  const pathname = usePathname();

  const activeKey = pathname.startsWith("/materials/children-lessons") || pathname.startsWith("/materials/children/lesson")
    ? "children-lessons"
    : pathname.startsWith("/materials/bible") || pathname.startsWith("/materials/egw")
      ? "bible-egw"
      : pathname.startsWith("/materials/hymnal")
        ? "hymnals"
        : pathname.startsWith("/materials/adult/lesson")
          ? "adult-lesson"
          : pathname.startsWith("/materials/adult/mission-reading")
            ? "adult-mission"
            : pathname.startsWith("/materials/children/mission-reading")
              ? "children-mission"
              : undefined;

  return (
    <aside className="hidden h-full min-h-0 w-60 shrink-0 border-r border-[#dfdbd1] bg-[#ede8dc] lg:block">
      <div className="h-full min-h-0 space-y-5 overflow-y-auto p-5 scrollbar-thin">
        <div className="border-b border-[#dfdbd1] pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#b36b3c]">Study Materials</p>
          <p className="mt-1 text-xs text-[#617068]">
            Sabbath School lessons, mission readings, scripture &amp; E.G. White writings.
          </p>
        </div>
        <nav className="space-y-4">
          {materialGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((dest) => {
                  const isActive = activeKey === dest.key;
                  const Icon = dest.icon;
                  const row = (
                    <>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{dest.label}</span>
                      {dest.isExternal && <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />}
                    </>
                  );
                  const cls = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                    isActive ? "bg-[#26352f] text-white shadow-sm" : "text-[#26352f] hover:bg-[#f7f4ee]"
                  }`;
                  return dest.isExternal ? (
                    <a key={dest.key} href={dest.href} className={cls}>
                      {row}
                    </a>
                  ) : (
                    <Link key={dest.key} href={dest.href} className={cls}>
                      {row}
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
