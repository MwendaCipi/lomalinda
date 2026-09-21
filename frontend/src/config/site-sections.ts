import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Book,
  BookOpen,
  Building2,
  Calendar,
  Handshake,
  Megaphone,
  Music,
  ShieldCheck,
  Users,
} from "lucide-react";

/**
 * The destinations the website's public pages point to.
 *
 * These lists used to live in the sidebar components that hung off About,
 * Calendar, Privacy and Materials. The public site has no sidebars any more, so
 * the same links are rendered as cards in the page body instead — the data sits
 * here so the pages and the cards cannot drift apart.
 */
export type SectionLink = {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

/** Beside About: the church's story, its calendar, partnerships and privacy. */
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
    key: "partnerships",
    href: "/partnerships",
    label: "Partnerships",
    description: "Work with the church in ministry and community impact.",
    icon: Handshake,
  },
  {
    key: "privacy",
    href: "/privacy",
    label: "Privacy & Terms",
    description: "How we handle the information you share with us.",
    icon: ShieldCheck,
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
  {
    key: "services",
    href: "/share/services",
    label: "Order of Service",
    description: "The Sabbath programme and order of service.",
    icon: BookOpen,
  },
];

/** The four sections the study materials are grouped into. */
export type MaterialSection = "hymnals" | "bible-egw" | "adult-weekly" | "children-weekly";

export const materialSections: { value: MaterialSection; label: string; description: string; icon: LucideIcon }[] = [
  {
    value: "hymnals",
    label: "Hymnals",
    description: "SDA Church Hymnal and Nyimbo za Kristo lyrics and song search for worship.",
    icon: Music,
  },
  {
    value: "bible-egw",
    label: "Bible & EGW",
    description: "Holy Scriptures and Spirit of Prophecy writings for worship and study.",
    icon: Book,
  },
  {
    value: "adult-weekly",
    label: "Adult Weekly",
    description: "Current Sabbath School lesson guides and world mission reports for adults and youth.",
    icon: Users,
  },
  {
    value: "children-weekly",
    label: "Children Weekly",
    description: "Age-appropriate lesson guides and mission stories for kids across all age groups.",
    icon: Baby,
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
