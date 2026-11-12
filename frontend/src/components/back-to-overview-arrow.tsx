"use client";

import { MoveLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { backOrDashboard } from "@/lib/app-history";

/**
 * The Gmail/WhatsApp-style back arrow: an icon-only way back to the
 * administration overview cards. It sits at the top-left *inside* the page's
 * heading row — never on a row of its own — at every width. On a phone it is
 * the way out where the permanent sidebar is out of sight; on a desktop it
 * remains a quick step back without reaching for the rail.
 *
 * A desk of the console's that is read somewhere else — the deaconate's own
 * pages, opened from the Ministry map — takes the same arrow but gives it its
 * own destination, so the way back leads where the reader came from rather
 * than to a console they were never in. The overview itself is the phone's
 * card grid, so on a wide screen the default way back is the previous page
 * (the dashboard when there is none) rather than a blank Administration page.
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
      onClick={onClick ?? (() => backOrDashboard(router))}
      className="-ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-current transition hover:bg-sand hover:text-ember"
    >
      <MoveLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
