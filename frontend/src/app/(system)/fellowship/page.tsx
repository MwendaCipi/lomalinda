import Link from "next/link";
import { Megaphone, Camera, Heart, Sparkles, Lightbulb, ChevronRight, Baby, Handshake } from "lucide-react";

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
  return (
    <main className="min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="mx-auto h-full w-full max-w-3xl px-4 py-6 sm:px-8 md:overflow-y-auto custom-hover-scrollbar">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Fellowship &amp; Community</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Fellowship</h1>
          <p className="mt-2 text-sm leading-6 text-[#617068]">
            Where the church family gathers — open any of them.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group flex items-center gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b36b3c]/50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] text-[#617068] transition group-hover:bg-[#b36b3c]/15 group-hover:text-[#b36b3c]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[#26352f]">{card.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#617068]">{card.description}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#c9c5bb] transition group-hover:text-[#b36b3c]" />
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
