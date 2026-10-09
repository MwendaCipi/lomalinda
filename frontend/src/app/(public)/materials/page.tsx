"use client";

import { useEffect, useState } from "react";

import { SubNav } from "@/components/sub-nav";
import { PublicSectionNav } from "@/components/public-section-nav";
import { MaterialsShelf } from "@/components/materials-destinations";
import { fellowshipLinks, materialSections, type MaterialSection } from "@/config/site-sections";

/** The shelf the page opens on when nothing else is asked for. */
const DEFAULT_SECTION: MaterialSection = "lesson-guides";

const isSection = (value: string | null): value is MaterialSection =>
  materialSections.some((section) => section.value === value);

/** The shelf a deep link asks for, read off the address bar. */
function sectionFromUrl(): MaterialSection {
  if (typeof window === "undefined") return DEFAULT_SECTION;
  const wanted = new URLSearchParams(window.location.search).get("section");
  return isSection(wanted) ? wanted : DEFAULT_SECTION;
}

/**
 * The Materials hub: one page, four shelves, a topbar to switch between them.
 *
 * There is no "choose a study area" step — the strip is the choice, and the
 * cards under it are readers, so a member is two taps from the lesson they came
 * for and never lands on a page of cards that only leads to another page of
 * cards. The shelves are `materialSections`: Lesson Guides, Mission Readings,
 * Bible & EGW, Hymnals.
 *
 * The shelf rides in the address (`?section=`) so one can be shared, bookmarked
 * or linked from another page, and it is *replaced* rather than pushed —
 * switching a toggle is not a step deeper into the page, so Back still leaves
 * it. The URL is read off the address bar rather than through `useSearchParams`
 * for the same reason the rail does it: this page is a static export, and the
 * query only matters after a real visit.
 *
 * The marketing intro and the Fellowship tail below return only for signed-out
 * visitors, where the page doubles as the public website's study-materials page.
 *
 * The page a first-time visitor searches for: every study reading the church
 * makes available without an account.
 */
export default function MaterialsPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [section, setSection] = useState<MaterialSection>(DEFAULT_SECTION);

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem("access_token")));
    setSection(sectionFromUrl());
  }, []);

  const active = materialSections.find((entry) => entry.value === section) ?? materialSections[0];

  const show = (next: MaterialSection) => {
    setSection(next);
    window.history.replaceState(null, "", next === DEFAULT_SECTION ? "/materials/" : `/materials/?section=${next}`);
  };

  return (
    <main className={signedIn ? "h-full min-h-0 bg-white text-bark" : "min-h-screen bg-sand text-bark"}>
      {/* Compact hub heading — the toggles and the cards are the point. The
          line under it is desktop-only: on a phone it costs a row of the screen
          and says no more than the labels below it. */}
      <section className={signedIn ? "sr-only" : "px-6 pt-14 lg:px-8"}>
        <div className={signedIn ? "max-w-5xl" : "max-w-6xl"}>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember">Study Materials</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Study Materials</h1>
          <p className="mt-2 hidden text-sm leading-6 text-moss sm:block">
            Sabbath School lessons, mission readings, Scripture, hymns and the writings of Ellen G. White — one shelf for each kind of study.
          </p>
        </div>
      </section>

      {/* The topbar: the four shelves, switched in place. It is a strip of
          toggles rather than links — the page underneath does not change. */}
      <section className={signedIn ? "px-5 pt-4 sm:px-8 lg:px-10" : "px-6 pt-8 lg:px-8"}>
        <div className={signedIn ? "max-w-5xl" : "max-w-4xl"}>
          <SubNav
            label="Study materials"
            items={materialSections.map((entry) => ({ key: entry.value, label: entry.label, icon: entry.icon }))}
            value={section}
            onChange={(key) => show(key as MaterialSection)}
          />
        </div>
      </section>

      {/* The shelf the topbar chose. */}
      <section className={signedIn ? "px-5 py-5 sm:px-8 lg:px-10" : "px-6 py-8 lg:px-8"}>
        <div className={signedIn ? "max-w-5xl" : "max-w-4xl"}>
          {/* Only the description, not a second copy of the label: the toggle
              above already names the shelf, and this line says what is on it. */}
          <p className="mb-4 text-xs leading-5 text-moss">{active.description}</p>
          <MaterialsShelf section={section} />
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
