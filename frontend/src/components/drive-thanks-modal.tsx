"use client";

import Link from "next/link";
import { Check } from "lucide-react";

/**
 * A word of thanks once a gift is confirmed.
 *
 * The M-Pesa prompt alone does not move a drive — the money is only real when
 * Safaricom's callback lands. So this opens with the refresh that catches the
 * gift, naming how far the drive has come, rather than at prompt time when
 * nothing has changed yet. `href` is the drive's page, offered when the giver
 * is somewhere else (the shelf); a giver already on the drive sees only the
 * thanks.
 */
export function DriveThanksModal({
  title,
  percentage,
  target,
  href,
  onClose,
}: {
  title: string;
  percentage: number;
  target: number;
  href?: string;
  onClose: () => void;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(percentage) || 0)));
  const goal = Number(target || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-thanks-title"
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-white text-center shadow-2xl ring-1 ring-sand-line"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-7">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mist-soft ring-1 ring-sage/25">
            <Check className="h-8 w-8 text-sage" aria-hidden="true" />
          </span>
          <h2 id="drive-thanks-title" className="text-xl font-bold text-bark">
            Thank you!
          </h2>
          <p className="text-sm leading-relaxed text-moss">
            Because of you, <span className="font-semibold text-bark">{title}</span> is now{" "}
            <span className="font-bold text-ember">{pct}%</span> of the way to its KES {goal} goal.
          </p>
          <div className="mt-1 flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-sage px-6 text-sm font-semibold text-white transition hover:bg-sage-deep"
            >
              Wonderful!
            </button>
            {href && (
              <Link
                href={href}
                onClick={onClose}
                className="inline-flex h-10 w-full items-center justify-center rounded-full border border-sand-mute text-sm font-semibold text-bark transition hover:border-ember hover:text-ember"
              >
                View the drive
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
