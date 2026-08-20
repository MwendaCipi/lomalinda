"use client";

import Link from "next/link";

const requestItems = [
  {
    href: "/community/prayer",
    title: "Prayer & Visitation Requests",
    text: "Submit a prayer request for our prayer team or request a pastoral / home visit with map location.",
    icon: "🙏",
  },
  {
    href: "/community/child-dedication",
    title: "Child Dedication Requests",
    text: "Begin a conversation about dedicating your child during Sabbath worship.",
    icon: "👶",
  },
  {
    href: "/enroll",
    title: "Membership Requests",
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
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-6 pb-10 text-[#26352f] sm:py-8 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Home</span>
        </Link>

        <div className="mt-4 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Requests</h1>
        </div>

        <div className="mt-6 grid gap-4 sm:gap-5 md:grid-cols-2">
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
    </main>
  );
}
