"use client";

import Link from "next/link";
import { MINISTRIES } from "@/config/ministries";

export default function MinistriesPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <div className="mx-auto max-w-6xl px-6 py-6 lg:px-8 lg:py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Home</span>
        </Link>
        <div className="mt-4 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Our ministries</h1>
          <p className="mt-3 text-base text-[#617068]">
            Explore our church ministries and support their mission and community programs.
          </p>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-2">
          {MINISTRIES.map((ministry) => (
            <article
              key={ministry.slug}
              className="flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm sm:p-7"
            >
              <div>
                <h2 className="text-xl font-semibold sm:text-2xl">
                  <Link href={`/ministries/${ministry.slug}`} className="hover:text-[#b36b3c] hover:underline">
                    {ministry.title}
                  </Link>
                </h2>
                <p className="mt-2.5 text-sm leading-6 text-[#617068]">{ministry.description}</p>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#dfdbd1] pt-4">
                <Link
                  href={`/ministries/${ministry.slug}`}
                  className="text-sm font-semibold text-[#b36b3c] hover:underline"
                >
                  Explore &rarr;
                </Link>
                <Link
                  href={`/give?purpose=${encodeURIComponent(ministry.givingPurpose)}`}
                  className="rounded-full bg-[#26352f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#b36b3c]"
                >
                  Support ministry
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
