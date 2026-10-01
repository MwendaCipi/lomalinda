import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Book,
  BookOpen,
  Building2,
  Calendar,
  FileText,
  Globe,
  HandHelping,
  Handshake,
  Heart,
  Lightbulb,
  Megaphone,
  Music,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { MINISTRIES } from "@/config/ministries";
import { destinations as navDestinations } from "@/config/navigation";

/**
 * The destinations the website's public pages point to.
 *
 * These lists used to live in the sidebar components that hung off the public
 * pages. The public site has no sidebars any more, so the same links are
 * rendered as cards in the page body instead — the data sits here so the pages
 * and the cards cannot drift apart.
 */
export type SectionLink = {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

/** Beside About: the church's story, its calendar and privacy. */
export const aboutSectionLinks: SectionLink[] = [
  {
    key: "about",
    href: "/about",
    label: "About SDA Loma Linda",
    description: "Our story, mission, vision and the values that guide us.",
    icon: Building2,
  },
  {
    key: "calendar",
    href: "/calendar",
    label: "Church Calendar",
    description: "Sabbaths, vespers, programmes and upcoming events.",
    icon: Calendar,
  },
  {
    key: "privacy",
    href: "/privacy",
    label: "Privacy Policy",
    description: "How we handle the information you share with us.",
    icon: ShieldCheck,
  },
  {
    key: "terms",
    href: "/terms",
    label: "Terms of Use",
    description: "The rules for using church accounts and digital services.",
    icon: FileText,
  },
];

/** News and events around the calendar. */
export const newsAndEventsLinks: SectionLink[] = [
  {
    key: "announcements",
    href: "/announcements",
    label: "All Announcements",
    description: "Notices and updates shared with the church family.",
    icon: Megaphone,
  },
  {
    key: "calendar",
    href: "/calendar",
    label: "Events Calendar",
    description: "Everything happening in the church year.",
    icon: Calendar,
  },
];

/**
 * The four shelves the study materials are grouped into — the toggles on the
 * Materials page's own topbar, and what a link into the page can name.
 *
 * They are the member's reading order rather than a filing order: the week's
 * study first (the lesson guides, then the mission readings), then the two
 * shelves that are always open — Scripture with the Spirit of Prophecy, then
 * the hymnbooks.
 */
export type MaterialSection = "lesson-guides" | "mission-readings" | "bible-egw" | "hymnals";

export const materialSections: { value: MaterialSection; label: string; description: string; icon: LucideIcon }[] = [
  {
    value: "lesson-guides",
    label: "Lesson Guides",
    description: "The current Sabbath School guides — adult, young adult and every children's division.",
    icon: BookOpen,
  },
  {
    value: "mission-readings",
    label: "Mission Readings",
    description: "This quarter's mission stories from the Adventist Mission quarterlies.",
    icon: Globe,
  },
  {
    value: "bible-egw",
    label: "Bible & EGW",
    description: "Holy Scriptures and Spirit of Prophecy writings for worship and study.",
    icon: Book,
  },
  {
    value: "hymnals",
    label: "Hymnals",
    description: "SDA Church Hymnal and Nyimbo za Kristo lyrics and song search for worship.",
    icon: Music,
  },
];

/** The study materials as section-card links, e.g. for `PublicSectionNav`. */
export const materialSectionLinks: SectionLink[] = materialSections.map((section) => ({
  key: section.value,
  href: `/materials/?section=${section.value}`,
  label: section.label,
  description: section.description,
  icon: section.icon,
}));

/**
 * Beside Requests & Care: the ways someone can ask the church for help or join
 * it. Prayer and visitation are separate desks now; partnership requests were
 * retired.
 */
export const requestsAndCareLinks: SectionLink[] = [
  {
    key: "prayer-visitation",
    href: "/community/prayer",
    label: "Prayer Requests",
    description: "Send a prayer request to the church's pastoral prayer team.",
    icon: Heart,
  },
  {
    key: "visitation",
    href: "/community/visitation",
    label: "Visitation Requests",
    description: "Ask for a pastoral, home or hospital visit.",
    icon: HandHelping,
  },
  {
    key: "child-dedication",
    href: "/community/child-dedication",
    label: "Child Dedication",
    description: "Begin a conversation about dedicating your child during worship.",
    icon: Baby,
  },
  {
    key: "enroll",
    href: "/enroll",
    label: "Transfer",
    description: "Join through baptism or transfer, or request a transfer out.",
    icon: Handshake,
  },
];

/**
 * Stewardship & Support: how to give, what the church is raising for, and the
 * treasury's published figures.
 *
 * Built from the nav registry (config/navigation.ts), so a label or path
 * cannot drift from what the bars, tiles and footer call the same place —
 * this sidebar used to say "Money Giving" while every other surface said
 * "Giving".
 */
export const stewardshipLinks: SectionLink[] = (
  [
    "give",
    "fundDrives",
    "inKind",
    "budget",
    "financial",
    "reports",
  ] as const
).map((key) => {
  const dest = navDestinations[key];
  return {
    key,
    href: dest.href,
    label: dest.label,
    description: dest.description ?? "",
    icon: dest.icon,
  };
});

/**
 * Beside Fellowship & Community: what the church family is saying and doing.
 * Shared by the Fellowship hub and the pages that point back into it.
 */
export const fellowshipLinks: SectionLink[] = [
  {
    key: "announcements",
    href: "/announcements",
    label: "Announcements",
    description: "Notices and updates shared with the church family.",
    icon: Megaphone,
  },
  {
    key: "calendar",
    href: "/calendar",
    label: "Church Calendar",
    description: "Sabbaths, vespers, programmes and upcoming events.",
    icon: Calendar,
  },
  {
    key: "moments",
    href: "/share/moments",
    label: "Moments",
    description: "The church's events, album by album — kept by the administrators.",
    icon: Sparkles,
  },
  {
    key: "testimonies",
    href: "/spiritual/testimonies",
    label: "Testimonies",
    description: "Read and share how God is at work among us.",
    icon: Sparkles,
  },
  {
    key: "ideas",
    href: "/support/ideas",
    label: "Ideas",
    description: "Offer an idea that could help the church.",
    icon: Lightbulb,
  },
];

/**
 * Beside a ministry page: the church's ministries, so a visitor can move between
 * them. Built from the ministries config, which stays the single source of truth.
 */
export const ministrySectionLinks: SectionLink[] = MINISTRIES.map((ministry) => ({
  key: ministry.slug,
  href: `/ministries/${ministry.slug}`,
  label: ministry.title,
  description: ministry.description,
  icon: Users,
}));
