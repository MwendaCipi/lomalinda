import Link from "next/link";
import { SupportSidebar } from "@/components/sidebars/support-sidebar";

const supportCategories = [
  {
    title: "Tithes & Offerings",
    description: "Give tithes, offerings, ministry support, building funds, or special pledges via M-Pesa, Card, or cash.",
    href: "/give",
    icon: (
      <svg className="h-6 w-6 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 8v2m0-10a9 9 0 110 18 9 9 0 010-18z" />
      </svg>
    ),
  },
  {
    title: "Church Budget",
    description: "Review published annual church budgets and departmental budget allocations.",
    href: "/support/budget",
    icon: (
      <svg className="h-6 w-6 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    title: "Live Reports",
    description: "View real-time, transparent contribution tracking across giving categories.",
    href: "/support/reports",
    icon: (
      <svg className="h-6 w-6 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: "Periodic Reports",
    description: "Access weekly, monthly, quarterly, and annual published church financial statements.",
    href: "/support/periodical-reports",
    icon: (
      <svg className="h-6 w-6 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: "Ideas & Suggestions",
    description: "Share creative proposals, ministry suggestions, or ideas for church growth.",
    href: "/support/ideas",
    icon: (
      <svg className="h-6 w-6 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-4a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
];

export default function SupportHubPage() {
  return (
    <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <SupportSidebar />
        <div className="flex-1 min-w-0 w-full h-full md:h-[calc(100vh-4rem)] bg-white p-5 pb-28 sm:p-8 lg:p-10 border-b border-[#dfdbd1] md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Stewardship &amp; Support</h1>
              <p className="hidden sm:block mt-2 text-base text-[#617068]">
                Faithfully supporting God&apos;s work through tithes, offerings, ministry ideas, and transparent stewardship.
              </p>
            </div>

            {/* Desktop Section Overview Banner */}
            <div className="mt-8 hidden rounded-3xl bg-[#26352f] p-8 text-white shadow-sm lg:block">
              <span className="text-xs font-bold uppercase tracking-widest text-[#f1c89e]">Stewardship Hub</span>
              <h2 className="mt-2 text-2xl font-semibold">Supporting Loma Linda SDA Church</h2>
              <p className="mt-3 text-sm leading-6 text-white/80 max-w-2xl">
                Use the left navigation sidebar to give tithes and offerings online, submit ministry ideas and proposals, view published annual church budgets, or access financial transparency reports.
              </p>
              <div className="mt-6 flex gap-3">
                <Link href="/give" className="rounded-full bg-[#b36b3c] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#96552e]">
                  Give Tithes &amp; Offerings
                </Link>
                <Link href="/support/reports" className="rounded-full border border-white/30 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10">
                  Live Reports
                </Link>
              </div>
            </div>

            {/* Mobile Cards View (hidden on desktop) */}
            <div className="mt-6 grid gap-4 sm:gap-5 md:grid-cols-2 lg:hidden">
              {supportCategories.map((cat) => (
                <Link
                  key={cat.href}
                  href={cat.href}
                  className="group flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-5 sm:p-6 transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-sm"
                >
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f7f4ee] group-hover:bg-[#f1c89e]/20">
                      {cat.icon}
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-[#26352f] group-hover:text-[#b36b3c]">
                      {cat.title}
                    </h2>
                    <p className="mt-1.5 text-xs sm:text-sm leading-5 text-[#617068]">
                      {cat.description}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#b36b3c]">
                    <span>Open category</span>
                    <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
