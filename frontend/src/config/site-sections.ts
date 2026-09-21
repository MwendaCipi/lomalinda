import type { LucideIcon } from "lucide-react";
import {
  Baby,
  BarChart3,
  Book,
  BookOpen,
  Building2,
  Calendar,
  Camera,
  CreditCard,
  FileText,
  Gift,
  Handshake,
  Heart,
  Lightbulb,
  Megaphone,
  Music,
  ShieldCheck,
  Sparkles,
  Sprout,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { MINISTRIES } from "@/config/ministries";

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

/**
 * Beside Requests & Care: the ways someone can ask the church for help, join it,
 * or work with it. Shared by the Requests hub, Partnerships and Membership.
 */
export const requestsAndCareLinks: SectionLink[] = [
  {
    key: "prayer",
    href: "/community/prayer",
    label: "Prayer Requests",
    description: "Send a prayer request and our prayer team will intercede with you.",
    icon: Heart,
  },
  {
    key: "visitation",
    href: "/community/visitation",
    label: "Pastoral Visitation",
    description: "Ask for a pastoral, home or hospital visit.",
    icon: Calendar,
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
    label: "Membership & Transfers",
    description: "Join through baptism or transfer, or request a transfer out.",
    icon: Handshake,
  },
  {
    key: "partnerships",
    href: "/partnerships",
    label: "Partnership Requests",
    description: "Partner with us in ministry, community impact and shared initiatives.",
    icon: Sprout,
  },
];

/**
 * Beside Stewardship & Support: how to give, what the church is raising for, and
 * the treasury's published figures. Shared by Giving and a fund drive's page.
 */
export const stewardshipLinks: SectionLink[] = [
  {
    key: "give",
    href: "/give",
    label: "Money Giving",
    description: "Give tithes and offerings by M-Pesa or bank transfer.",
    icon: CreditCard,
  },
  {
    key: "in-kind",
    href: "/support/in-kind",
    label: "In-Kind Giving",
    description: "Offer goods, equipment, services or time instead of money.",
    icon: Gift,
  },
  {
    key: "campaigns",
    href: "/support/campaigns",
    label: "Fund Drives",
    description: "Active fundraising campaigns and how far along they are.",
    icon: Target,
  },
  {
    key: "budget",
    href: "/support/budget",
    label: "Church Budget",
    description: "How the church plans and spends its budget.",
    icon: BarChart3,
  },
  {
    key: "reports",
    href: "/support/reports",
    label: "Live Reports",
    description: "Up-to-date giving and treasury figures.",
    icon: TrendingUp,
  },
  {
    key: "periodical-reports",
    href: "/support/periodical-reports",
    label: "Periodic Reports",
    description: "Monthly and quarterly ministry reports.",
    icon: FileText,
  },
];

/**
 * Beside Fellowship & Community: what the church family is saying and doing.
 * Shared by the Fellowship hub and the live services page.
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
    key: "services",
    href: "/share/services",
    label: "Live Services",
    description: "Join worship online, or catch up on a service you missed.",
    icon: Camera,
  },
  {
    key: "moments",
    href: "/share/moments",
    label: "Photos & Moments",
    description: "Pictures and video from worship, fellowship and outreach.",
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
    key: "calendar",
    href: "/calendar",
    label: "Church Calendar",
    description: "Sabbaths, vespers, programmes and upcoming events.",
    icon: Calendar,
  },
  {
    key: "ideas",
    href: "/support/ideas",
    label: "Ideas & Suggestions",
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
