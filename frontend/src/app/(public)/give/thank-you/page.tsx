"use client";

import Link from "next/link";
import { Suspense, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, LogIn } from "lucide-react";

/** Nothing here watches the token; the store never changes mid-visit. */
const subscribeNever = () => () => {};

/**
 * Whether this browser holds a session token, read on the client only.
 *
 * The static build sees `false` and a signed-in browser corrects it after
 * hydration, so the two never disagree — and no effect calls setState, which
 * the compiler lint rightly discourages.
 */
function useSignedIn(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => Boolean(localStorage.getItem("access_token")),
    () => false
  );
}

/**
 * The public thank-you a giver lands on after giving without signing in.
 *
 * It is the same door whether money or goods were given, so it reads from the
 * address rather than from any account: `type` says what was given, `method`
 * says how (an M-Pesa prompt may still be waiting on a PIN), and `campaign` /
 * `title` say which drive it was for. Nothing here is confidential — no phone
 * number, no amount — so the page is safe to share or revisit.
 */
function ThankYouContent() {
  const params = useSearchParams();
  const kind = params.get("type") === "in-kind" ? "in-kind" : "money";
  const method = (params.get("method") || "mpesa").toLowerCase();
  const campaignId = (params.get("campaign") || "").trim();
  const title = (params.get("title") || "").trim();

  const signedIn = useSignedIn();

  const pendingMpesa = kind === "money" && method === "mpesa";
  const drivePath = campaignId ? `/campaigns/${encodeURIComponent(campaignId)}` : "";
  const forDrive = title ? ` for ${title}` : "";

  const heading = pendingMpesa ? "Almost there" : kind === "in-kind" ? "Thank you for your gift" : "Thank you for your giving";

  const body = pendingMpesa
    ? `We've sent an M-Pesa prompt to your phone. Enter your PIN to complete your gift${forDrive} — it counts as soon as Safaricom confirms it.`
    : kind === "in-kind"
      ? `Your in-kind gift${forDrive} has been recorded. The stewardship team will follow up on the items you listed.`
      : `Your bank transfer details${forDrive} have been recorded. It counts toward the drive once the deposit lands.`;

  const signInHref = `/login?next=${encodeURIComponent(drivePath || "/give")}`;

  return (
    <main className="min-h-screen bg-sand text-bark">
      <div className="mx-auto max-w-xl px-6 py-16 lg:py-24">
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-sand-line sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mist-soft ring-1 ring-sage/30">
            <Check size={30} className="text-sage-bright" aria-hidden="true" />
          </div>

          <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-moss">{body}</p>

          <div className="mt-8 flex flex-col items-center gap-3">
            {drivePath ? (
              <>
                <Link
                  href={drivePath}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-sage px-6 py-3 text-sm font-semibold text-white transition hover:bg-sage-deep sm:w-auto"
                >
                  Back to the fund drive
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
                <Link
                  href="/give"
                  className="inline-flex w-full items-center justify-center rounded-full border border-sand-mute bg-white px-6 py-3 text-sm font-semibold text-bark transition hover:border-ember hover:text-ember sm:w-auto"
                >
                  Go to Giving
                </Link>
              </>
            ) : (
              <Link
                href="/give"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-sage px-6 py-3 text-sm font-semibold text-white transition hover:bg-sage-deep sm:w-auto"
              >
                Go to Giving
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        {/* A visitor keeps the option to make giving theirs: a signed-in giver
            sees their record and invitees. Members who already have an account
            read only the drive links above. */}
        {!signedIn && (
          <div className="mt-6 flex flex-col items-start gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sand-line sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="text-sm font-semibold text-bark">Want to keep a record of your giving?</p>
              <p className="mt-0.5 text-xs text-moss">
                Sign in to see your own contributions and share a personal invite link.
              </p>
            </div>
            <Link
              href={signInHref}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-bark px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-bark-deep sm:text-sm"
            >
              <LogIn size={14} aria-hidden="true" /> Sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ThankYouPage() {
  return (
    <Suspense
      fallback={<main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">Loading…</main>}
    >
      <ThankYouContent />
    </Suspense>
  );
}
