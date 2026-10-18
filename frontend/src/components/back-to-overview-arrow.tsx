"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * The Gmail/WhatsApp-style back arrow: an icon-only way back to the
 * administration overview cards. It sits at the top-left *inside* the page's
 * heading row — never on a row of its own — and shows on mobile only, where
 * the permanent sidebar that handles navigation on desktop is out of sight.
 *
 * A desk of the console's that is read somewhere else — the deaconate's own
 * pages, opened from the Ministry map — takes the same arrow but gives it its
 * own destination, so the way back leads where the reader came from rather
 * than to a console they were never in.
 */
export function BackToOverviewArrow({
  onClick,
  label = "Back to overview",
}: {
  onClick?: () => void;
  /** Names the place the arrow returns to, for a screen reader. */
  label?: string;
} = {}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick ?? (() => router.replace("/administration?tab=overview", { scroll: false }))}
      className="lg:hidden -ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-bark transition hover:bg-sand hover:text-ember"
    >
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
