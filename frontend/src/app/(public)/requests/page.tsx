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
    <main className={signedIn ? "h-full min-h-0 bg-white text-bark" : "min-h-screen bg-sand text-bark"}>
      {/* Signed in, this page is the Requests hub the tab opens — the strip
          at the top names the page, so the heading is for screen readers only
          and the marketing hero is for signed-out visitors. */}
      <section className={signedIn ? "sr-only" : "px-6 pt-14 lg:px-8"}>
        <div className="max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember">Care &amp; ministry support</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Requests &amp; Care</h1>
          <p className="mt-2 text-sm leading-6 text-moss">
            Prayer, visitation, dedication and membership — open the one you need.
          </p>
        </div>
      </section>
      <section className={signedIn ? "hidden" : "px-6 pt-14 lg:px-8"}>
        <div className={signedIn ? "max-w-5xl" : "mx-auto max-w-6xl"}>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ember">Care &amp; ministry support</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Requests &amp; Care</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-moss">
            We are here to walk with you through prayer, pastoral visitation, child dedication, and
            membership. Tell us what you need and the right person will follow up.
          </p>
        </div>
      </section>

      <section className={signedIn ? "hidden border-t border-sand-line bg-white px-5 py-8 sm:px-8 lg:block lg:px-10" : "px-6 py-12 lg:px-8 lg:py-14"}>
        <div className={signedIn ? "max-w-5xl rounded-[1.5rem] bg-bark px-6 py-8 text-white shadow-sm sm:px-8" : "mx-auto max-w-6xl rounded-[2rem] bg-bark px-8 py-10 text-white shadow-sm sm:px-12 sm:py-12"}>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-gold">How we can help</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">How can we support you today?</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75">
            Submit a prayer request, book a pastoral or home visit, arrange a child dedication, or apply to join
            the church or transfer your membership.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/community/prayer-visitation"
              className="rounded-full bg-ember px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-ember-dark"
            >
              Prayer &amp; visitation requests
            </Link>
            <Link
              href="/enroll"
              className="rounded-full border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/50"
            >
              Membership
            </Link>
          </div>
        </div>
      </section>

      {/* The old Requests sidebar, now part of the page: the same five destinations.
          On a phone this list sits directly under the heading — it IS the hub. */}
      <PublicSectionNav
        eyebrow="Get started"
        title="Every request, in one place"
        description="Prayer, visitation, dedication and membership — open the one you need and we will take it from there."
        links={requestsAndCareLinks}
        className={signedIn ? "lg:hidden" : "border-t border-sand-line bg-white/60"}
      />
    </main>
  );
}
