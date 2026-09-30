"use client";

import Link from "next/link";
import {
  BookOpen,
  ExternalLink,
  Feather,
  Globe,
  Library,
  Lightbulb,
  Music,
  Music2,
  Shapes,
  Sprout,
  type LucideIcon,
} from "lucide-react";

import { fellowshipResources } from "@/config/fellowship-resources";
import type { MaterialSection } from "@/config/site-sections";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One reader on a shelf — a lesson guide, a quarterly, a hymnbook, Scripture. */
export type MaterialDestination = {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  isExternal: boolean;
};

/**
 * The Materials page's four shelves, as its own topbar names them (see
 * `materialSections`): the week's lesson guides, the week's mission readings,
 * and the two shelves that are always open — Scripture with the Spirit of
 * Prophecy, then the hymnbooks.
 *
 * Every entry is a reader rather than a step, which is the whole point of the
 * toggles: the shelf a member picks is the thing they came to read, so the old
 * hubs behind a card became shelves rather than further card pages.
 *
 * `/materials/bible` and `/materials/hymnal` still stand as deep pages for
 * anyone who linked or bookmarked them; each carries the same readers and then
 * hands back to the shelf it belongs to.
 *
 * Children's lessons stay a small family of their own — five age divisions,
 * Beginner through Teens — so that one card opens the divisions rather than
 * making the shelf seven cards deep.
 */
export const materialShelves: Record<MaterialSection, MaterialDestination[]> = {
  "lesson-guides": [
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
      key: "children-lessons",
      href: "/materials/children-lessons",
      label: "Children Lessons",
      description: "Lesson guides for every age group — Beginner through Teens. Choose a division inside.",
      icon: Shapes,
      isExternal: false,
    },
  ],
  "mission-readings": [
    {
      key: "adult-mission",
      href: `${API_URL}/api/members/mission-reading/adult/`,
      label: "Adult Mission Reading",
      description: "Weekly mission stories from the Adventist Mission quarterlies, youth and adult.",
      icon: Globe,
      isExternal: true,
    },
    {
      key: "children-mission",
      href: `${API_URL}/api/members/mission-reading/children/`,
      label: "Children Mission Reading",
      description: "Mission stories told for children — prayer, global awareness and faith in Jesus.",
      icon: Sprout,
      isExternal: true,
    },
  ],
  "bible-egw": [
    {
      key: "bible",
      href: fellowshipResources.bible,
      label: "Read & Search the Holy Bible",
      description:
        "Search books, chapters, parallel translations and study references for daily devotions, family altar and lesson preparation.",
      icon: Library,
      isExternal: true,
    },
    {
      key: "egw",
      href: fellowshipResources.egw,
      label: "Explore the E.G. White Writings",
      description:
        "The complete published writings of Ellen G. White — books, articles, letters and manuscripts, searchable by topic, scripture or phrase.",
      icon: Feather,
      isExternal: true,
    },
  ],
  hymnals: [
    {
      key: "hymnal",
      href: fellowshipResources.hymnal,
      label: "Seventh-day Adventist Hymnal",
      description:
        "Search hymns by title, lyrics, category or hymn number. Ideal for personal worship, choir preparation and church song services.",
      icon: Music,
      isExternal: true,
    },
    {
      key: "nzk",
      href: fellowshipResources.nzk,
      label: "Nyimbo za Kristo (Swahili)",
      description: "Browse the complete Swahili hymnbook collection for Sabbath School, vespers, family devotions and worship praise.",
      icon: Music2,
      isExternal: true,
    },
  ],
};

/**
 * One shelf, as cards. The toggle above has already chosen which one, so these
 * cards carry no "here" highlight: the strip says where you are.
 */
export function MaterialsShelf({ section }: { section: MaterialSection }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {materialShelves[section].map((dest) => {
        const Icon = dest.icon;
        const inner = (
          <>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-bark" aria-hidden="true">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-bark">{dest.label}</span>
              <span className="mt-0.5 block text-xs leading-5 text-moss">{dest.description}</span>
            </span>
            {dest.isExternal ? (
              <ExternalLink className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" />
            ) : (
              <span className="shrink-0 text-sand-mute transition group-hover:text-ember" aria-hidden="true">
                &rarr;
              </span>
            )}
          </>
        );

        const cls =
          "group flex items-center gap-4 rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50";

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
