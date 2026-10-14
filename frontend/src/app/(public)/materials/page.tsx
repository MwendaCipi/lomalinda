"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { SubNav } from "@/components/sub-nav";
import { PublicSectionNav } from "@/components/public-section-nav";
import { MaterialsShelf } from "@/components/materials-destinations";
import { usePageHeader } from "@/components/app-frame";
import { fellowshipLinks, materialSections, type MaterialSection } from "@/config/site-sections";

/** The shelf the page opens on when nothing else is asked for. */
const DEFAULT_SECTION: MaterialSection = "lesson-guides";

/** What the page is, in one line — read as the heading's description. */
const PAGE_DESCRIPTION =
  "Sabbath School lessons, mission readings, Scripture, hymns and the writings of Ellen G. White.";

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
 * Inside the app the shelf strip is handed to the shell rather than drawn here.
 * Two strips used to stand on top of this page — the shell's Fellowship pages
 * and this page's own shelves — so a member read two rows of toggles that were
 * not even the same kind of thing. Handing the shelves to the shell makes them
 * the *only* strip: no section strip is left to name, the heading reads
 * Materials and the shelves answer to it, the same shape an opened area takes
 * on My Areas. Materials is a place of its own on the rail and a tab of its own
 * on a phone, so the page carries no way back to Fellowship above its name —
 * the bars it was reached from are the way out.
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

  const { setCustomToggles, setCustomHeader, setHeadingFirst } = usePageHeader();

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem("access_token")));
    setSection(sectionFromUrl());
  }, []);

  const active = materialSections.find((entry) => entry.value === section) ?? materialSections[0];

  const show = useCallback((next: MaterialSection) => {
    setSection(next);
    window.history.replaceState(null, "", next === DEFAULT_SECTION ? "/materials/" : `/materials/?section=${next}`);
  }, []);

  // The shelf chips, in one stable array: the shell's toggle slot is written
  // from an effect, so a fresh list each render would re-register every time.
  const shelfItems = useMemo(
    // `short` is what a phone reads: the four shelves share one row there, so
    // the one-worder is the name, and the full one answers on a wider screen.
    () => materialSections.map((entry) => ({ key: entry.value, label: entry.label, short: entry.short, icon: entry.icon })),
    []
  );

  // The shelves are this page's navigation, so they take the shell's strip —
  // which is what retires the Fellowship row while a member is here.
  useEffect(() => {
    setCustomToggles(
      <SubNav
        label="Study materials"
        value={section}
        onChange={(key) => show(key as MaterialSection)}
        items={shelfItems}
      />
    );
    return () => setCustomToggles(null);
  }, [section, shelfItems, show, setCustomToggles]);

  // A phone reads this page top-down: the way back and the place, then the
  // shelves themselves. The shell's default names the place first — the strip
  // answers to it — so the page asks for its own order while it is on screen.
  useEffect(() => {
    setHeadingFirst(true);
    return () => setHeadingFirst(false);
  }, [setHeadingFirst]);

  // The page names itself: the shelf strip below it is this page's, not a
  // section's, so the heading is the only place the place is named.
  useEffect(() => {
    setCustomHeader({ label: "Materials", description: PAGE_DESCRIPTION });
    return () => setCustomHeader(null);
  }, [setCustomHeader]);

  return (
    <main className={signedIn ? "h-full min-h-0 bg-white text-bark" : "min-h-screen bg-sand text-bark"}>
      {/* Signed-out only: the app's shell draws this page's heading and its
          shelf strip, and a public visitor has neither. */}
      {!signedIn && (
        <>
          <section className="px-6 pt-14 lg:px-8">
            <div className="max-w-6xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember">Study Materials</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Study Materials</h1>
              <p className="mt-2 hidden text-sm leading-6 text-moss sm:block">{PAGE_DESCRIPTION}</p>
            </div>
          </section>

          {/* The topbar: the four shelves, switched in place. It is a strip of
              toggles rather than links — the page underneath does not change. */}
          <section className="px-6 pt-8 lg:px-8">
            <div className="max-w-4xl">
              <SubNav
                label="Study materials"
                items={shelfItems}
                value={section}
                onChange={(key) => show(key as MaterialSection)}
              />
            </div>
          </section>
        </>
      )}

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
                Sabbath School lessons, mission readings, Scripture and the Spirit of Prophecy, gathered in one place
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
