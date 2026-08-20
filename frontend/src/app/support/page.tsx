"use client";

import Link from "next/link";

const supportCategories = [
  {
    title: "Giving & Donations",
    description: "Give tithes, offerings, ministry support, building funds, or in-kind gifts via M-Pesa, Card, or physical pledge.",
    href: "/give",
    icon: (
      <svg className="h-6 w-6 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 8v2m0-10a9 9 0 110 18 9 9 0 010-18z" />
      </svg>
    ),
  },
  {
    title: "Ideas & Moral Support",
    description: "Share creative proposals, ministry suggestions, or pledge prayer & moral backing for church leaders and projects.",
    href: "/support/ideas",
    icon: (
      <svg className="h-6 w-6 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-4a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
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
    title: "Financial Reports",
    description: "View transparent monthly, quarterly, and annual church financial statements.",
    href: "/support/reports",
    icon: (
      <svg className="h-6 w-6 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
];

export default function SupportHubPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-6 pb-10 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Home</span>
        </Link>

        <div className="mt-4 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Stewardship &amp; Support</h1>
        </div>

        <div className="mt-6 grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-2">
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
    </main>
  );
}
