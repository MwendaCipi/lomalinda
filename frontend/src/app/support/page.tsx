"use client";

import Link from "next/link";

const supportCategories = [
  {
    title: "Financial Giving",
    description: "Support church operations, tithes, offerings, building projects, and mission work through online giving and M-Pesa.",
    href: "/support/financial",
    badge: "Tithes & Offerings",
    icon: (
      <svg className="h-7 w-7 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 8v2m0-10a9 9 0 110 18 9 9 0 010-18z" />
      </svg>
    ),
  },
  {
    title: "Give in Kind",
    description: "Pledge or donate physical equipment, food supplies, building materials, instruments, or professional services to the church.",
    href: "/support/in-kind",
    badge: "Physical & Services",
    icon: (
      <svg className="h-7 w-7 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    title: "Prayers & Moral Support",
    description: "Share your prayer requests, seek pastoral counseling, or offer spiritual encouragement and volunteer support for fellow members.",
    href: "/support/prayers",
    badge: "Spiritual & Care",
    icon: (
      <svg className="h-7 w-7 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    title: "Church Budget",
    description: "Review published annual church budgets, departmental budget allocations, and planned stewardship projects for Loma Linda SDA.",
    href: "/support/budget",
    badge: "Annual Plans",
    icon: (
      <svg className="h-7 w-7 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    title: "Financial Reports",
    description: "View transparent monthly, quarterly, and annual financial statements detailing tithes, offerings, and church expenditures.",
    href: "/support/reports",
    badge: "Monthly, Quarterly, Annual",
    icon: (
      <svg className="h-7 w-7 text-[#b36b3c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
];

export default function SupportHubPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-12 pb-16 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Stewardship & Care</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Church Support Hub</h1>
          <p className="mt-4 text-base leading-7 text-[#617068] sm:text-lg">
            Partner with Loma Linda SDA Church through financial giving, in-kind contributions, prayer support, and transparent financial reporting.
          </p>
        </div>

        {/* 5 Category Cards Grid */}
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {supportCategories.map((cat) => (
            <Link
              key={cat.href}
              href={cat.href}
              className="group flex flex-col justify-between rounded-3xl border border-[#dfdbd1] bg-white p-7 transition-all duration-200 hover:-translate-y-1 hover:border-[#b36b3c] hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f7f4ee] group-hover:bg-[#f1c89e]/20">
                    {cat.icon}
                  </div>
                  <span className="rounded-full bg-[#f7f4ee] px-3 py-1 text-xs font-semibold text-[#617068]">
                    {cat.badge}
                  </span>
                </div>
                <h2 className="mt-6 text-2xl font-semibold text-[#26352f] group-hover:text-[#b36b3c]">
                  {cat.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#617068]">
                  {cat.description}
                </p>
              </div>
              <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-[#b36b3c]">
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
