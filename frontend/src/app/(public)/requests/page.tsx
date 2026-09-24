"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PublicSectionNav } from "@/components/public-section-nav";
import { requestsAndCareLinks } from "@/config/site-sections";

export default function RequestsPage() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem("access_token")));
  }, []);

  return (
    <main className={signedIn ? "h-full min-h-0 bg-white text-[#26352f]" : "min-h-screen bg-[#f7f4ee] text-[#26352f]"}>
      {/* Signed in, this page is the Requests hub the tab opens — the cards
          are the point, so a phone gets the compact hub heading and the
          marketing hero returns from lg up, where the sidebar makes room. */}
      <section className={signedIn ? "px-5 pt-5 lg:hidden" : "px-6 pt-14 lg:px-8"}>
        <div className="max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Care &amp; ministry support</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Requests &amp; Care</h1>
          <p className="mt-2 text-sm leading-6 text-[#617068]">
            Prayer, visitation, dedication, membership, partnership — open the one you need.
          </p>
        </div>
      </section>
      <section className={signedIn ? "hidden px-5 py-5 sm:px-8 lg:block lg:px-10" : "px-6 pt-14 lg:px-8"}>
        <div className={signedIn ? "max-w-5xl" : "mx-auto max-w-6xl"}>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Care &amp; ministry support</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Requests &amp; Care</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-[#617068]">
            We are here to walk with you through prayer, pastoral visitation, child dedication, membership, and
            partnership. Tell us what you need and the right person will follow up.
          </p>
        </div>
      </section>

      <section className={signedIn ? "hidden border-t border-[#dfdbd1] bg-white px-5 py-8 sm:px-8 lg:block lg:px-10" : "px-6 py-12 lg:px-8 lg:py-14"}>
        <div className={signedIn ? "max-w-5xl rounded-[1.5rem] bg-[#26352f] px-6 py-8 text-white shadow-sm sm:px-8" : "mx-auto max-w-6xl rounded-[2rem] bg-[#26352f] px-8 py-10 text-white shadow-sm sm:px-12 sm:py-12"}>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#f1c89e]">How we can help</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">How can we support you today?</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75">
            Submit a prayer request, book a pastoral or home visit, arrange a child dedication, apply to join the
            church or transfer your membership, or start a conversation about partnering with us.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/community/prayer"
              className="rounded-full bg-[#b36b3c] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#96552e]"
            >
              Submit a prayer request
            </Link>
            <Link
              href="/community/visitation"
              className="rounded-full bg-[#5f8067] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#4d6d55]"
            >
              Request a visit
            </Link>
            <Link
              href="/enroll"
              className="rounded-full border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/50"
            >
              Membership &amp; transfers
            </Link>
          </div>
        </div>
      </section>

      {/* The old Requests sidebar, now part of the page: the same five destinations.
          On a phone this list sits directly under the heading — it IS the hub. */}
      <PublicSectionNav
        eyebrow="Get started"
        title="Every request, in one place"
        description="Prayer, visitation, dedication, membership and partnerships — open the one you need and we will take it from there."
        links={requestsAndCareLinks}
        className={signedIn ? "lg:hidden" : "border-t border-[#dfdbd1] bg-white/60"}
      />
    </main>
  );
}
