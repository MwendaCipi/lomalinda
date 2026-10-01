"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { nextMeeting, gatheringLabel, type WeeklyMeeting } from "@/lib/gathering";
import { dayFirst, weekdayOf } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type ChurchSettings = {
  latitude: string | null;
  longitude: string | null;
};

type Announcement = {
  id: number;
  title: string;
  text: string;
  detail?: string;
  href?: string;
  action_type: "none" | "tithe" | "combined_offering" | "13th_sabbath" | "camp_expenses" | "camp_goal" | "local_church_budget" | "respond";
  action_prompt?: string;
};

/**
 * The card beside the clarion hero: the next gathering, and the week's
 * announcements.
 *
 * Announcements used to replace the hero, which made the church's standing
 * welcome vanish whenever something was published. Instead of a second card
 * they now rotate through this one, so the column stays a single card and the
 * clarion call never moves. While a programme is actually happening the card
 * holds on the gathering so its live link is never rotated away.
 *
 * A giving announcement's slide carries the giving actions themselves —
 * Pledge, In-kind and Give Money, always in one row, left to right — instead
 * of a form-and-done flow; the Fellowship feed is where a member answers an
 * opinion question or reads the full text.
 */
export function NextGatheringCard() {
  const [settings, setSettings] = useState<ChurchSettings | null>(null);
  const [meetings, setMeetings] = useState<WeeklyMeeting[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [slide, setSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pledgeOpen, setPledgeOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setSettings)
      .catch(() => setSettings(null));
    // The week itself: the settings are read only for the church's map pin.
    fetch(`${API_URL}/api/members/weekly-meetings/`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setMeetings(Array.isArray(data?.meetings) ? data.meetings : []))
      .catch(() => setMeetings([]));
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    fetch(`${API_URL}/api/members/announcements/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Announcement[]) => {
        if (!Array.isArray(data)) return;
        setAnnouncements(data);
      })
      .catch(() => undefined);
  }, []);

  const gathering = useMemo(() => nextMeeting(meetings, now), [meetings, now]);

  // Slide 0 is always the gathering; the announcements follow it.
  const slideCount = 1 + announcements.length;
  const index = Math.min(slide, slideCount - 1);
  const current = index > 0 ? announcements[index - 1] : undefined;
  const canRotate = slideCount > 1 && !gathering?.active;

  useEffect(() => {
    if (!canRotate || isPaused || isInteracting) return;
    const timer = window.setInterval(() => setSlide((prev) => (prev + 1) % slideCount), 7000);
    return () => window.clearInterval(timer);
  }, [canRotate, isPaused, isInteracting, slideCount]);

  const mapsUrl = settings?.latitude && settings.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${settings.latitude},${settings.longitude}`
    : null;
  const actionHref = gathering?.online ? gathering.link : mapsUrl;
  const joinOpen = Boolean(gathering?.online && gathering.active && actionHref);
  const actionType = current?.action_type || "none";
  const isContributionAction = actionType !== "none" && actionType !== "respond";

  // A new slide starts with its pledge field closed.
  useEffect(() => {
    setPledgeOpen(false);
    setPledgeAmount("");
    setStatusMessage("");
    setSuccessMessage("");
  }, [current?.id]);

  async function handlePledgeSubmit(event: FormEvent) {
    event.preventDefault();
    if (!current) return;
    setSubmitting(true);
    setStatusMessage("");

    try {
      const token = localStorage.getItem("access_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch(`${API_URL}/api/members/announcements/${current.id}/action/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action_type: actionType,
          pledge_amount: pledgeAmount ? parseFloat(pledgeAmount) : null,
          response_text: "",
          respondent_name: name,
          respondent_phone: phone,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Unable to record your pledge.");
      }

      setSuccessMessage("Thank you! Your pledge has been recorded.");
      setPledgeAmount("");
      setName("");
      setPhone("");

      setTimeout(() => {
        setSuccessMessage("");
        setPledgeOpen(false);
        setSlide((prev) => (prev + 1) % slideCount);
        setIsInteracting(false);
      }, 1400);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsInteracting(true)}
      onBlurCapture={(event) => {
        // Leaving the card (not just moving between its fields) resumes rotation.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsInteracting(false);
      }}
      className="relative flex min-h-80 flex-col overflow-hidden rounded-[2rem] bg-sage-wash p-8 text-bark shadow-sm ring-1 ring-sage-mist sm:min-h-[28rem] sm:p-10"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ember">
          {current ? `Announcement ${index} of ${announcements.length}` : gathering?.active ? "Now happening" : "Next gathering"}
        </p>

        {slideCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSlide((prev) => (prev - 1 + slideCount) % slideCount)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-sage-line text-sm text-sage-gray transition hover:border-ember hover:text-ember"
              aria-label="Previous"
            >
              &larr;
            </button>
            <div className="flex items-center gap-1.5 px-1">
              {Array.from({ length: slideCount }).map((_, dot) => (
                <button
                  key={dot}
                  type="button"
                  onClick={() => setSlide(dot)}
                  aria-label={dot === 0 ? "Next gathering" : `Announcement ${dot}`}
                  className={`h-2 rounded-full transition-all ${dot === index ? "w-5 bg-ember" : "w-2 bg-sage-line"}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSlide((prev) => (prev + 1) % slideCount)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-sage-line text-sm text-sage-gray transition hover:border-ember hover:text-ember"
              aria-label="Next"
            >
              &rarr;
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <h2 className="text-3xl font-semibold">
          {current ? current.title : gathering ? gatheringLabel(gathering, now) : "Our week together"}
        </h2>
        {current ? (
          <>
            <p className="mt-3 text-base leading-7 text-moss-dark">{current.text}</p>
            {current.detail && <p className="mt-2 text-sm leading-6 text-moss">{current.detail}</p>}
          </>
        ) : gathering ? (
          <>
            <p className="mt-3 text-lg leading-7 text-moss-dark">{gathering.time}</p>
            <p className="mt-3 text-sm text-moss">
              {gathering.online ? "Online" : gathering.place || "Church grounds, Loma Linda, Meru"}
            </p>
          </>
        ) : (
          <p className="mt-3 text-lg leading-7 text-moss-dark">
            The week&apos;s meetings are still being set up — the church calendar has what is on.
          </p>
        )}
      </div>

      <div className="mt-auto">
        {current && successMessage ? (
          <div className="border-t border-sage-line pt-6">
            <div className="rounded-xl bg-white/70 p-3 text-center text-sm font-semibold text-moss-dark">{successMessage}</div>
          </div>
        ) : current && isContributionAction ? (
          <div className="border-t border-sage-line pt-6">
            {/* The giving actions, always one row, left to right: Pledge,
                In-kind, Give Money. The order is a commitment: deliberate
                giving first, then goods, then money. */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {pledgeOpen ? (
                <span aria-hidden className="rounded-full border border-dashed border-sage-line px-2 py-2.5 text-center text-xs text-sage-fog sm:text-sm" />
              ) : (
                <button
                  type="button"
                  onClick={() => { setPledgeOpen(true); setIsInteracting(true); }}
                  className="rounded-full border border-sage-pale bg-white px-2 py-2.5 text-xs font-bold text-bark transition hover:border-ember hover:text-ember sm:text-sm"
                >
                  Pledge
                </button>
              )}
              <Link
                href="/support/in-kind"
                className="rounded-full border border-sage-pale bg-white px-2 py-2.5 text-center text-xs font-bold text-bark transition hover:border-ember hover:text-ember sm:text-sm"
              >
                In-kind
              </Link>
              <Link
                href={`/give?purpose=${encodeURIComponent(current.title)}`}
                className="rounded-full bg-sage-strong px-2 py-2.5 text-center text-xs font-bold text-white transition hover:bg-sage-shade sm:text-sm"
              >
                Give Money
              </Link>
            </div>
            <p className="mt-2 text-center text-xs text-moss">towards {current.title}</p>

            {pledgeOpen && (
              <form onSubmit={handlePledgeSubmit} className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-bark">Pledge Amount (KES)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 5000"
                    value={pledgeAmount}
                    onChange={(event) => setPledgeAmount(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-sage-line bg-white px-3 py-2 text-sm text-bark outline-none focus:border-ember"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="Your Name (optional)"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="rounded-xl border border-sage-line bg-white px-3 py-2 text-xs text-bark outline-none focus:border-ember"
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number (optional)"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="rounded-xl border border-sage-line bg-white px-3 py-2 text-xs text-bark outline-none focus:border-ember"
                  />
                </div>
                {statusMessage && <p className="text-xs text-red-700">{statusMessage}</p>}
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitting || !pledgeAmount}
                    className="rounded-full bg-ember px-5 py-2 text-xs font-bold text-white transition hover:bg-ember-dark disabled:opacity-60"
                  >
                    {submitting ? "Submitting..." : "Record pledge"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPledgeOpen(false); setStatusMessage(""); }}
                    className="text-xs font-semibold text-moss hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : !current && gathering ? (
          <div className="border-t border-sage-line pt-6">
            <p className="text-sm text-moss">{weekdayOf(gathering.date)} · {dayFirst(gathering.date)}</p>
            {gathering.online ? (
              joinOpen ? (
                <Link href={actionHref!} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-ember hover:underline">Join meeting &rarr;</Link>
              ) : (
                <span className="mt-4 inline-block text-sm font-semibold text-sage-slate">Join meeting <span className="font-normal">(opens at start time)</span></span>
              )
            ) : (
              <Link href={mapsUrl || "/calendar"} target={mapsUrl ? "_blank" : undefined} rel={mapsUrl ? "noreferrer" : undefined} className="mt-4 inline-block text-sm font-semibold text-ember hover:underline">View location &rarr;</Link>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
