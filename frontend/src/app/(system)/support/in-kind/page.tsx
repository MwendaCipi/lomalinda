"use client";

import { useState } from "react";
import Link from "next/link";
import { Gift } from "lucide-react";
import { IN_KIND_PURPOSES, InKindGiftModal } from "@/components/in-kind-gift-modal";

/**
 * In-Kind Giving — the act, not the record.
 *
 * The record of what has been handed over used to be this page's whole body,
 * with the form behind a modal — the same shape the money-giving page had
 * before its record moved to /member/givings. This page followed it there, so
 * what is left here is the giving: the button, and what fits under it.
 */
function GiveInKindPageContent() {
  // The form is a modal, opened by Give Now — one form, so a gift is filed
  // identically wherever it is given (the announcements and drives open it too).
  const [showGiveModal, setShowGiveModal] = useState(false);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-bark">
      {/* /support/in-kind pins at every width (scrollModeForPath): the document
          never scrolls, so the page carries its own scroller — the button and
          the card move as one, whatever the viewport. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-8 pt-4 sm:px-8 sm:pt-5 lg:px-10">
        <div className="space-y-6">
          {/* The shell's page strip already names the place; visitors and
              screen readers get it here. */}
          <h1 className="sr-only">In-Kind Giving</h1>

          {/* ── Give Now: the direct path, in the middle of the page ── */}
          <div className="flex flex-col items-center justify-center gap-3 py-6 text-center sm:py-8">
            <p className="max-w-md text-sm text-moss">
              Offer goods, equipment, services or time instead of money: list what you are
              giving in the form and the stewardship team follows up on it.
            </p>
            <button
              type="button"
              onClick={() => setShowGiveModal(true)}
              className="rounded-full bg-ember px-10 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-ember-deep"
            >
              Give Now
            </button>
            <Link href="/member/givings" className="text-xs font-semibold text-ember hover:underline">
              View my in-kind givings
            </Link>
          </div>

          {/* ── What fits under it ── The purposes the form offers, named here
              so a member knows what they can hand over before opening it. */}
          <article className="rounded-3xl border border-sand-line bg-white p-5 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-bold text-bark">
              <Gift size={14} aria-hidden="true" /> What can you give?
            </p>
            <ul className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              {IN_KIND_PURPOSES.map((purpose) => (
                <li key={purpose} className="flex items-center gap-2 font-semibold text-bark">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ember" aria-hidden="true" />
                  {purpose}
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-sand-line pt-3 text-[11px] text-moss">
              Every gift is recorded against your account, and its receipt waits under My Givings.
            </p>
          </article>
        </div>
      </div>

      {/* The giving form, the same modal the announcements open — one form,
          so a gift is filed identically wherever it is given. After it closes
          the record itself is one link away (the modal has already thanked
          the giver). */}
      <InKindGiftModal open={showGiveModal} onClose={() => setShowGiveModal(false)} />
    </main>
  );
}

export default function GiveInKindPage() {
  return <GiveInKindPageContent />;
}
