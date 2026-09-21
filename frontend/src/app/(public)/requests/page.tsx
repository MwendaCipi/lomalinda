import Link from "next/link";
import { RequestsSidebar } from "@/components/sidebars/requests-sidebar";

const requestItems = [
  {
    href: "/community/prayer",
    title: "Prayer Requests",
    text: "Submit a prayer request for our prayer team to intercede with and for you.",
    icon: "🙏",
  },
  {
    href: "/community/visitation",
    title: "Pastoral Visitation",
    text: "Request a pastoral, home, or hospital visit with map location coordinates.",
    icon: "🏠",
  },
  {
    href: "/community/child-dedication",
    title: "Child Dedication Requests",
    text: "Begin a conversation about dedicating your child during Sabbath worship.",
    icon: "👶",
  },
  {
    href: "/enroll",
    title: "Membership & Transfers",
    text: "Join Loma Linda SDA Church through baptism or membership transfer, or request a transfer out.",
    icon: "🤝",
  },
  {
    href: "/partnerships",
    title: "Partnership Requests",
    text: "Explore a partnership with Loma Linda SDA Church for ministry, community impact, or shared initiatives.",
    icon: "🌱",
  },
];

export default function RequestsPage() {
  return (
    <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <RequestsSidebar />
        <div className="flex-1 min-w-0 w-full h-full md:h-[calc(100vh-4rem)] bg-white p-5 sm:p-8 lg:p-10 border-b border-[#dfdbd1] md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Requests &amp; Care</h1>
              <p className="hidden sm:block mt-2 text-base text-[#617068]">
                We are here to walk with you through prayer, pastoral visitation, child dedication, membership transfers, and strategic partnerships.
              </p>
            </div>

            {/* Desktop Section Overview Banner */}
            <div className="mt-8 hidden rounded-3xl bg-[#26352f] p-8 text-white shadow-sm lg:block">
              <span className="text-xs font-bold uppercase tracking-widest text-[#f1c89e]">Care &amp; Ministry Support</span>
              <h2 className="mt-2 text-2xl font-semibold">How can we support you today?</h2>
              <p className="mt-3 text-sm leading-6 text-white/80 max-w-2xl">
                Choose an option from the left sidebar to submit a prayer request, book a pastoral or home visit, schedule a child dedication service, submit a membership transfer application, or inquire about partnership opportunities.
              </p>
              <div className="mt-6 flex gap-3">
                <Link href="/community/prayer" className="rounded-full bg-[#b36b3c] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#96552e]">
                  Submit Prayer Request
                </Link>
                <Link href="/community/visitation" className="rounded-full bg-[#5f8067] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#4d6d55]">
                  Request Visitation
                </Link>
                <Link href="/enroll" className="rounded-full border border-white/30 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10">
                  Membership &amp; Transfers
                </Link>
              </div>
            </div>

            {/* Mobile Cards View (hidden on desktop) */}
            <div className="mt-6 grid gap-4 sm:gap-5 md:grid-cols-2 lg:hidden">
              {requestItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-5 sm:p-6 transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-sm"
                >
                  <div>
                    <span className="text-2xl" aria-hidden="true">
                      {item.icon}
                    </span>
                    <h2 className="mt-2 text-xl font-semibold text-[#26352f] group-hover:text-[#b36b3c]">
                      {item.title}
                    </h2>
                    <p className="mt-1.5 text-xs sm:text-sm leading-5 text-[#617068]">{item.text}</p>
                  </div>
                  <span className="mt-4 inline-block text-xs sm:text-sm font-semibold text-[#b36b3c]">
                    Open form &rarr;
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
