import Link from "next/link";
import { FellowshipSidebar } from "@/components/sidebars/fellowship-sidebar";

type FellowshipItem = {
  href: string;
  title: string;
  text: string;
  icon?: string;
  badge?: string;
};

const fellowshipItems: FellowshipItem[] = [
  {
    href: "/announcements",
    title: "Announcements",
    text: "Stay updated with church news, upcoming sabbath programs, and notices.",
    icon: "📢",
  },
  {
    href: "/share/moments",
    title: "Live Services & Moments",
    text: "Watch worship services and explore photos & videos of fellowship moments.",
    icon: "📸",
  },
  {
    href: "/spiritual/testimonies",
    title: "Testimonies",
    text: "Share a testimony online or request an opportunity to share during fellowship.",
    icon: "✨",
  },
  {
    href: "/calendar",
    title: "Calendar",
    text: "View upcoming Sabbath services, midweek vespers, and special church events.",
    icon: "📅",
  },
];

export default function FellowshipPage() {
  return (
    <main className="min-h-screen bg-white text-[#26352f]">
      <div className="flex min-h-[calc(100vh-4rem)]">
        <FellowshipSidebar />
        <div className="flex-1 min-w-0 w-full min-h-[calc(100vh-4rem)] bg-white p-5 sm:p-8 lg:p-10 border-b border-[#dfdbd1]">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Fellowship &amp; Community</h1>
            <p className="hidden sm:block mt-2 text-base text-[#617068]">
              Connect with Loma Linda SDA Church through announcements, live worship services, shared testimonies, and community fellowship.
            </p>
          </div>

          {/* Desktop Section Overview Banner */}
          <div className="mt-8 hidden rounded-3xl bg-[#26352f] p-8 text-white shadow-sm lg:block">
            <span className="text-xs font-bold uppercase tracking-widest text-[#f1c89e]">Fellowship Hub</span>
            <h2 className="mt-2 text-2xl font-semibold">Welcome to Fellowship &amp; Community</h2>
            <p className="mt-3 text-sm leading-6 text-white/80 max-w-2xl">
              Stay up-to-date with church announcements, watch live worship broadcasts, and read community testimonies.
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/announcements" className="rounded-full bg-[#b36b3c] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#96552e]">
                View Announcements
              </Link>
              <Link href="/share/moments" className="rounded-full border border-white/30 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10">
                Live Services &amp; Moments
              </Link>
            </div>
          </div>

          {/* Mobile Cards View (hidden on desktop) */}
          <div className="mt-6 grid gap-4 sm:gap-5 md:grid-cols-2 lg:hidden">
            {fellowshipItems.map((item) => (
              <Link key={item.href} href={item.href} className="group flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-sm sm:p-6">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    {item.icon && <span className="text-2xl" aria-hidden="true">{item.icon}</span>}
                    {item.badge && (
                      <span className="flex items-center gap-1.5 rounded-full bg-[#b36b3c]/10 px-3 py-1 text-xs font-semibold text-[#b36b3c]">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-[#26352f] group-hover:text-[#b36b3c]">{item.title}</h2>
                  <p className="mt-1.5 text-xs leading-5 text-[#617068] sm:text-sm">{item.text}</p>
                </div>
                <span className="mt-4 inline-block text-xs font-semibold text-[#b36b3c] sm:text-sm">Explore &rarr;</span>
              </Link>
            ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
