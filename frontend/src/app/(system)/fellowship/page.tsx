"use client";

import Link from "next/link";
import { Megaphone, Camera, Heart, Sparkles, Lightbulb, ChevronRight, Baby, Handshake } from "lucide-react";
import { useTableDensity, DensityToggle } from "@/lib/table-density";

/**
 * The Fellowship hub the phone tab bar opens.
 *
 * The desktop bar takes a signed-in member straight into the announcements
 * feed, where the Fellowship sidebar offers the other destinations; a phone
 * has no sidebar, so the tab opens this hub instead and the same destinations
 * are the cards. Requests and Care merged into Fellowship here: prayer and
 * visitation are one desk, child dedication and membership are part of the
 * same walk-with-you set, and partnership requests were retired.
 */
const cards = [
  {
    href: "/announcements",
    label: "Announcements",
    description: "Notices and updates shared with the church family.",
    icon: Megaphone,
  },
  {
    href: "/services",
    label: "Live Services",
    description: "Join worship online, or catch up on a service you missed.",
    icon: Camera,
  },
  {
    href: "/community/prayer-visitation",
    label: "Prayer & Visitation Requests",
    description: "Request prayer or a pastoral visit — one desk for both.",
    icon: Heart,
  },
  {
    href: "/spiritual/testimonies",
    label: "Testimonies",
    description: "Read and share how God is at work among us.",
    icon: Sparkles,
  },
  {
    href: "/community/child-dedication",
    label: "Child Dedication",
    description: "Begin a conversation about dedicating your child during worship.",
    icon: Baby,
  },
  {
    href: "/enroll",
    label: "Membership",
    description: "Join through baptism or transfer, or request a transfer out.",
    icon: Handshake,
  },
  {
    href: "/support/ideas",
    label: "Ideas & Suggestions",
    description: "Offer an idea that could help the church.",
    icon: Lightbulb,
  },
];

export default function FellowshipHubPage() {
  // The desk-wide compact preference, shared with the roster and every other
  // table: here it tightens the hub's cards rather than a table's rows.
  const { dense, toggleDensity } = useTableDensity();

  return (
    <main className="min-h-screen md:h-screen bg-sand text-bark md:overflow-hidden">
      <div className="mx-auto h-full w-full max-w-3xl px-4 py-6 sm:px-8 md:overflow-y-auto custom-hover-scrollbar">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember">Fellowship &amp; Community</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Fellowship</h1>
            <p className="mt-2 text-sm leading-6 text-moss">
              Where the church family gathers — open any of them.
            </p>
          </div>
          <DensityToggle dense={dense} onToggle={toggleDensity} />
        </div>

        <div className={`grid ${dense ? "mt-3 gap-2" : "mt-6 gap-3"} sm:grid-cols-2`}>
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className={`group flex items-center rounded-2xl border border-sand-line bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-ember/50 ${
                  dense ? "gap-3 p-3" : "gap-4 p-4"
                }`}
              >
                <span className={`flex shrink-0 items-center justify-center rounded-xl bg-sand text-moss transition group-hover:bg-ember/15 group-hover:text-ember ${dense ? "h-9 w-9" : "h-11 w-11"}`}>
                  <Icon className={dense ? "h-4 w-4" : "h-5 w-5"} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-bark">{card.label}</span>
                  {!dense && <span className="mt-0.5 block text-xs leading-5 text-moss">{card.description}</span>}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-sand-mute transition group-hover:text-ember" />
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
