"use client";

import { useEffect, useState } from "react";

import { PublicSectionNav } from "@/components/public-section-nav";
import { MaterialsDestinationCards } from "@/components/materials-destinations";
import { fellowshipLinks } from "@/config/site-sections";

/**
 * The Materials hub.
 *
 * There is no "choose a study area" step: the page is the destination cards —
 * Adult Lesson, YA Lesson, Adult Mission Reading, Children Lessons, Children
 * Mission Reading, Bible & EGW and Hymnals — the same list the PC sidebar
 * mirrors. The marketing intro below returns only for signed-out visitors, where
 * the page doubles as the public website's study-materials page.
 */
export default function MaterialsPage() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem("access_token")));
  }, []);

  return (
    <main className={signedIn ? "h-full min-h-0 bg-white text-bark" : "min-h-screen bg-sand text-bark"}>
      {/* Compact hub heading — the cards are the point. The line under it is
          desktop-only: on a phone it costs a row of the screen and says no more
          than the card labels below it. */}
      <section className={signedIn ? "sr-only" : "px-6 pt-14 lg:px-8"}>
        <div className={signedIn ? "max-w-5xl" : "max-w-6xl"}>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember">Study Materials</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Study Materials</h1>
          <p className="mt-2 hidden text-sm leading-6 text-moss sm:block">
            Sabbath School lessons, mission readings, Scripture, hymns and the Spirit of Prophecy — open one to begin.
          </p>
        </div>
      </section>

      {/* The destinations, on mobile and desktop alike. */}
      <section className={signedIn ? "px-5 py-5 sm:px-8 lg:px-10" : "px-6 py-8 lg:px-8"}>
        <div className={signedIn ? "max-w-5xl" : "max-w-4xl"}>
          <MaterialsDestinationCards />
        </div>
      </section>

      {/* Signed-out visitors keep the marketing framing the website had. */}
      {!signedIn && (
        <>
          <section className="px-6 py-12 lg:px-8 lg:py-14">
            <div className="mx-auto max-w-6xl rounded-[2rem] bg-bark px-8 py-10 text-white shadow-sm sm:px-12 sm:py-12">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-gold">Study &amp; worship resources</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Church Study Materials</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75">
                Sabbath School lessons, mission readings, Scripture and the Spirit of Prophecy — gathered in one place
                for personal devotion, family worship and class preparation.
              </p>
            </div>
          </section>

          <PublicSectionNav
            eyebrow="Fellowship"
            title="More from the church family"
            description="Announcements, testimonies and the ideas that help us grow."
            links={fellowshipLinks}
            className="border-t border-sand-line bg-white/60"
          />
        </>
      )}
    </main>
  );
}
