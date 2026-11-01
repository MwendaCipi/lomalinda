"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Clock, MapPin, ShieldCheck, UserCheck, UserX } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type RsvpInfo = {
  title: string;
  meeting_date: string;
  time_display: string;
  location: string;
  response: "" | "yes" | "no";
};

function day_first(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * The public page an invitation's confirm link opens.
 *
 * A board member reads the meeting — title, sabbath, time, venue — and taps
 * one of two answers. The link carries the member's identification (`u` and
 * the token the invitation wrote) and the meeting (`m`), so no sign-in is
 * needed; a signed-in member who is not the invitation's addressee still
 * answers from the link they were given. The meeting rides the query string
 * because the site ships as a static export — a `[id]` directory cannot be
 * parametrised without enumerating every meeting. The answer posts to the
 * same credentials.
 */
function BoardMeetingRsvpContent() {
  const params = useSearchParams();
  const meetingId = params.get("m") ?? "";
  const userId = params.get("u") ?? "";
  const token = params.get("t") ?? "";

  const [info, setInfo] = useState<RsvpInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [message, setMessage] = useState("");

  const credentials = `u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;

  useEffect(() => {
    let alive = true;
    if (!meetingId || !userId || !token) {
      // The complaint rides the microtask — the shape every desk's loads
      // use — so the effect's own synchronous body sets nothing.
      void Promise.resolve().then(() => {
        setLoadError("This invitation link is incomplete — ask the secretary to send it again.");
      });
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/members/board-meetings/${meetingId}/rsvp/?${credentials}`);
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) {
          setInfo(data);
        } else {
          setLoadError(data.detail || "We could not read this invitation.");
        }
      } catch {
        if (alive) setLoadError("We could not reach the church system. Check your connection and try again.");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, userId, token]);

  const answer = useCallback(
    async (response: "yes" | "no") => {
      setBusy(response);
      setMessage("");
      try {
        const res = await fetch(
          `${API_URL}/api/members/board-meetings/${meetingId}/rsvp/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ u: userId, t: token, response }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setInfo((current) => (current ? { ...current, response: data.response } : current));
          setMessage(
            data.response === "yes"
              ? "Thank you — your attendance is recorded."
              : "Noted. The church thanks you for the reply."
          );
        } else {
          setMessage(data.detail || data.response || "Could not save the answer. Try again.");
        }
      } catch {
        setMessage("Could not reach the church system. Check your connection and try again.");
      } finally {
        setBusy(null);
      }
    },
    [meetingId, userId, token]
  );

  if (loadError) {
    return (
      <main className="min-h-screen bg-sand px-6 py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-sand-line bg-white p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-moss-faint" aria-hidden="true" />
          <p className="mt-4 text-sm text-moss">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!info) {
    return (
      <main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">Loading the invitation…</main>
    );
  }

  return (
    <main className="min-h-screen bg-sand px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-md space-y-6">
        <div className="rounded-3xl border border-sand-line bg-white p-6 shadow-sm sm:p-8">
          <p className="text-[10px] font-bold uppercase tracking-wider text-moss-faint">Board meeting invitation</p>
          <h1 className="mt-1 text-xl font-extrabold text-bark">{info.title}</h1>
          <dl className="mt-4 space-y-2 text-sm text-moss">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
              <dd>{day_first(info.meeting_date)}</dd>
            </div>
            {info.time_display && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
                <dd>{info.time_display}</dd>
              </div>
            )}
            {info.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
                <dd>{info.location}</dd>
              </div>
            )}
          </dl>

          <div className="mt-6 border-t border-sand-line pt-5">
            <p className="text-sm font-semibold text-bark">Will you attend?</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void answer("yes")}
                disabled={busy !== null || info.response === "yes"}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-sage px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sage-deep disabled:opacity-60"
              >
                <UserCheck className="h-4 w-4" aria-hidden="true" />
                {busy === "yes" ? "Saving…" : info.response === "yes" ? "Attending ✓" : "I will attend"}
              </button>
              <button
                type="button"
                onClick={() => void answer("no")}
                disabled={busy !== null || info.response === "no"}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-sand-mute bg-white px-4 py-2.5 text-sm font-bold text-bark transition hover:border-ember hover:text-ember disabled:opacity-60"
              >
                <UserX className="h-4 w-4" aria-hidden="true" />
                {busy === "no" ? "Saving…" : info.response === "no" ? "Replied ✓" : "I cannot attend"}
              </button>
            </div>
            {message && <p className="mt-3 text-xs font-medium text-moss">{message}</p>}
            {info.response && !message && (
              <p className="mt-3 text-xs font-medium text-moss">
                {info.response === "yes"
                  ? "Your answer is in: you will attend."
                  : "Your answer is in: you cannot attend. The church thanks you for the reply."}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function BoardMeetingRsvpPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">Loading the invitation…</main>}>
      <BoardMeetingRsvpContent />
    </Suspense>
  );
}
