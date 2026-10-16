"use client";

import { useEffect, useState } from "react";

import { RequestsModal, type RequestType } from "@/components/requests-modal";

const REQUEST_TYPES = [
  { value: "prayer", label: "Prayer Request", description: "Send a prayer request to the pastoral team." },
  { value: "visitation", label: "Visitation Request", description: "Ask for a pastoral, home or hospital visit." },
  { value: "dedication", label: "Child Dedication", description: "Begin a conversation about dedicating your child during worship." },
  { value: "transfer", label: "Join / Transfer", description: "Request to join the church or transfer to another." },
] as const;

/** What the page is, in one line — read as the heading's description. */
const PAGE_DESCRIPTION =
  "Prayer, pastoral visitation, child dedication and membership — open the one you need and the right person will follow up.";

/**
 * Requests & Care: the four asking-for-something desks, as four cards.
 *
 * Signed in, the page lives in the app shell — the rail names the place and
 * the shell's heading carries this page's description — so the cards lead and
 * the marketing heading stays out of the way.
 *
 * Signed out, the same cards are the public website's Care & ministry support
 * page, and there the heading and its one-line description belong: a visitor
 * arriving from the landing page should read what this page is before being
 * asked to pick one of four forms. The heading returns only for signed-out
 * visitors, which is the shape Materials already uses.
 */
export default function RequestsPage() {
  const [open, setOpen] = useState(false);
  // Which desk the card opened: clicking Child Dedication must land on the
  // dedication form, not on the prayer one and a re-pick.
  const [picked, setPicked] = useState<RequestType>("prayer");
  const [signedIn, setSignedIn] = useState(false);

  // Which side of the site this reader is on. Read after paint, through a
  // microtask so the effect's own body stays synchronous-free (the idiom the
  // calendar and the reports panel use).
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setSignedIn(Boolean(localStorage.getItem("access_token")));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={signedIn ? "h-full min-h-0 bg-white text-bark" : "min-h-screen bg-sand text-bark"}>
      {!signedIn && (
        <section className="px-6 pt-14 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ember">
              Care &amp; ministry support
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Requests &amp; Care</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-moss">{PAGE_DESCRIPTION}</p>
          </div>
        </section>
      )}

      <div className={signedIn ? "mx-auto max-w-5xl px-5 py-5 sm:px-8 lg:px-10" : "mx-auto max-w-6xl px-6 py-8 lg:px-8"}>
        <div className="grid gap-5 sm:grid-cols-2">
          {REQUEST_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => {
                setPicked(type.value);
                setOpen(true);
              }}
              className="group rounded-2xl border border-sand-line bg-white p-6 text-left shadow-sm transition hover:border-ember/30 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-ember/10 px-3 py-1 font-semibold text-ember">
                  {type.label}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-moss">{type.description}</p>
            </button>
          ))}
        </div>
      </div>

      <RequestsModal open={open} initialType={picked} onClose={() => setOpen(false)} />
    </main>
  );
}
