"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type ChurchSettings = { latitude: string | null; longitude: string | null; midweek_vespers_link: string; live_service_link: string; live_service_active: boolean; midweek_vespers_time: string; friday_vespers_time: string; sabbath_time: string };
type Gathering = { day: number; hour: number; minute: number; endHour: number; endMinute: number; name: string; time: string; online: boolean; active: boolean; date: Date };

type Announcement = {
  id: number;
  title: string;
  text: string;
  detail?: string;
  href?: string;
  action_type: "acknowledge" | "pledge" | "respond";
  action_prompt?: string;
};

function clockRange(value: string | undefined, fallbackStart: [number, number], fallbackEnd: [number, number]) {
  const matches = (value || "").match(/(\d{1,2}):(\d{2})\s*([AP]M)/gi) || [];
  const parse = (text: string | undefined, fallback: [number, number]) => {
    if (!text) return fallback;
    const match = text.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!match) return fallback;
    let hour = Number(match[1]) % 12; if (match[3].toUpperCase() === "PM") hour += 12;
    return [hour, Number(match[2])] as [number, number];
  };
  return [parse(matches[0], fallbackStart), parse(matches[1], fallbackEnd)] as const;
}

/**
 * The card beside the clarion hero: the next gathering, and the week's
 * announcements.
 *
 * Announcements used to replace the hero, which made the church's standing
 * welcome vanish whenever something was published. Instead of a second card
 * they now rotate through this one, so the column stays a single card and the
 * clarion call never moves. While a programme is actually happening the card
 * holds on the gathering so its live link is never rotated away.
 */
export function NextGatheringCard() {
  const [settings, setSettings] = useState<ChurchSettings | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [slide, setSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [responseText, setResponseText] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setSettings)
      .catch(() => setSettings(null));
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
        setAnnouncements(data.filter((item) => !localStorage.getItem(`announcement-handled-${item.id}`)));
      })
      .catch(() => undefined);
  }, []);

  const gathering = useMemo(() => {
    const definitions = [
      { day: 3, name: "Midweek Vespers", time: settings?.midweek_vespers_time || "Wednesday · 8:00 PM – 9:00 PM", range: clockRange(settings?.midweek_vespers_time, [20, 0], [21, 0]), online: true },
      { day: 5, name: "Friday Vespers", time: settings?.friday_vespers_time || "Friday · 5:30 PM – 6:30 PM", range: clockRange(settings?.friday_vespers_time, [17, 30], [18, 30]), online: false },
      { day: 6, name: "Sabbath program", time: settings?.sabbath_time || "Saturday · 8:00 AM – 4:00 PM", range: clockRange(settings?.sabbath_time, [8, 0], [16, 0]), online: false },
    ];
    const candidates: Gathering[] = [];
    for (let week = -1; week <= 1; week += 1) definitions.forEach((definition) => {
      const date = new Date(now); let difference = definition.day - now.getDay() + week * 7; date.setDate(now.getDate() + difference); date.setHours(definition.range[0][0], definition.range[0][1], 0, 0);
      const end = new Date(date); end.setHours(definition.range[1][0], definition.range[1][1], 0, 0); if (end <= date) end.setDate(end.getDate() + 1);
      candidates.push({ day: definition.day, hour: definition.range[0][0], minute: definition.range[0][1], endHour: definition.range[1][0], endMinute: definition.range[1][1], name: definition.name, time: definition.time, online: definition.online, active: now >= date && now < end, date });
    });
    const active = candidates.find((candidate) => candidate.active);
    if (active) return active;
    return candidates.filter((candidate) => candidate.date > now).sort((a, b) => a.date.getTime() - b.date.getTime())[0] || candidates[0];
  }, [now, settings]);

  // Slide 0 is always the gathering; the announcements follow it.
  const slideCount = 1 + announcements.length;
  const index = Math.min(slide, slideCount - 1);
  const current = index > 0 ? announcements[index - 1] : undefined;
  const canRotate = slideCount > 1 && !gathering.active;

  useEffect(() => {
    if (!canRotate || isPaused || isInteracting) return;
    const timer = window.setInterval(() => setSlide((prev) => (prev + 1) % slideCount), 7000);
    return () => window.clearInterval(timer);
  }, [canRotate, isPaused, isInteracting, slideCount]);

  // Changing slide clears any half-written form state so rotation resumes.
  useEffect(() => {
    setIsInteracting(false);
  }, [index]);

  const mapsUrl = settings?.latitude && settings.longitude ? `https://www.google.com/maps/search/?api=1&query=${settings.latitude},${settings.longitude}` : null;
  const liveHref = gathering.active && settings?.live_service_active && settings.live_service_link ? settings.live_service_link : null;
  const actionHref = liveHref || (gathering.online ? settings?.midweek_vespers_link : mapsUrl);
  const gatheringLabel = gathering.active ? (gathering.name === "Sabbath program" ? "Sabbath program is ongoing" : `${gathering.name} is ongoing`) : (gathering.name === "Sabbath program" ? "Sabbath programs begin soon" : `${gathering.name} begins soon`);
  const joinOpen = gathering.online && gathering.active && Boolean(actionHref);
  const actionType = current?.action_type || "acknowledge";

  async function handleActionSubmit(event: FormEvent) {
    event.preventDefault();
    if (!current) return;
    setSubmitting(true);
    setStatusMessage("");
    setSuccessMessage("");

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
          response_text: responseText,
          respondent_name: name,
          respondent_phone: phone,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Unable to submit action.");
      }

      localStorage.setItem(`announcement-handled-${current.id}`, "true");
      setSuccessMessage("Thank you! Your action has been recorded.");
      setPledgeAmount("");
      setResponseText("");
      setName("");
      setPhone("");

      setTimeout(() => {
        setSuccessMessage("");
        setAnnouncements((prev) => prev.filter((item) => item.id !== current.id));
        setSlide(0);
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
      className="relative flex min-h-80 flex-col overflow-hidden rounded-[2rem] bg-[#d5dfd7] p-8 text-[#26352f] shadow-sm ring-1 ring-[#c9d5ca] sm:min-h-[28rem] sm:p-10"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">
          {current ? `Announcement ${index} of ${announcements.length}` : gathering.active ? "Now happening" : "Next gathering"}
        </p>

        {slideCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSlide((prev) => (prev - 1 + slideCount) % slideCount)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#c1d0c4] text-sm text-[#4a5b52] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
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
                  className={`h-2 rounded-full transition-all ${dot === index ? "w-5 bg-[#b36b3c]" : "w-2 bg-[#c1d0c4]"}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSlide((prev) => (prev + 1) % slideCount)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#c1d0c4] text-sm text-[#4a5b52] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
              aria-label="Next"
            >
              &rarr;
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <h2 className="text-3xl font-semibold">{current ? current.title : gatheringLabel}</h2>
        {current ? (
          <>
            <p className="mt-3 text-base leading-7 text-[#3d5148]">{current.text}</p>
            {current.detail && <p className="mt-2 text-sm leading-6 text-[#617068]">{current.detail}</p>}
          </>
        ) : (
          <>
            <p className="mt-3 text-lg leading-7 text-[#3d5148]">{gathering.time}</p>
            <p className="mt-3 text-sm text-[#617068]">{gathering.online ? "Online" : "Loma Linda SDA Church grounds"}</p>
          </>
        )}
      </div>

      <div className="mt-auto border-t border-[#c1d0c4] pt-8">
        {current ? (
          successMessage ? (
            <div className="rounded-xl bg-white/70 p-3 text-center text-sm font-semibold text-[#3d5148]">{successMessage}</div>
          ) : (
            <form onSubmit={handleActionSubmit} className="space-y-3">
              {actionType === "pledge" && (
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Pledge Amount (KES)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="e.g. 5000"
                    value={pledgeAmount}
                    onChange={(event) => { setIsInteracting(true); setPledgeAmount(event.target.value); }}
                    className="mt-1 w-full rounded-xl border border-[#c1d0c4] bg-white px-3 py-2 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                  />
                </div>
              )}

              {actionType === "respond" && (
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">{current.action_prompt || "Your Response"}</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Write your response..."
                    value={responseText}
                    onChange={(event) => { setIsInteracting(true); setResponseText(event.target.value); }}
                    className="mt-1 w-full rounded-xl border border-[#c1d0c4] bg-white px-3 py-2 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                  />
                </div>
              )}

              {(actionType === "pledge" || actionType === "respond") && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="Your Name (optional)"
                    value={name}
                    onChange={(event) => { setIsInteracting(true); setName(event.target.value); }}
                    className="rounded-xl border border-[#c1d0c4] bg-white px-3 py-2 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number (optional)"
                    value={phone}
                    onChange={(event) => { setIsInteracting(true); setPhone(event.target.value); }}
                    className="rounded-xl border border-[#c1d0c4] bg-white px-3 py-2 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                  />
                </div>
              )}

              {statusMessage && <p className="text-xs text-red-700">{statusMessage}</p>}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-[#b36b3c] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#96552e] disabled:opacity-60"
                >
                  {submitting ? "Submitting..." : actionType === "pledge" ? "Submit Pledge" : actionType === "respond" ? "Send Response" : "Acknowledge"}
                </button>
                {current.href && (
                  <a href={current.href} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#a9bcae] px-4 py-2.5 text-xs font-semibold text-[#26352f] transition hover:border-[#b36b3c]">
                    Learn More &rarr;
                  </a>
                )}
              </div>
            </form>
          )
        ) : (
          <>
            <p className="text-sm text-[#617068]">{gathering.date.toLocaleDateString("en-KE", { weekday: "long", month: "long", day: "numeric" })}</p>
            {liveHref ? (
              <Link href={liveHref} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] hover:underline">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />Join live &rarr;
              </Link>
            ) : gathering.online ? (
              joinOpen ? (
                <Link href={actionHref!} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-[#b36b3c] hover:underline">Join meeting &rarr;</Link>
              ) : (
                <span className="mt-4 inline-block text-sm font-semibold text-[#6d7a71]">Join meeting <span className="font-normal">(opens at start time)</span></span>
              )
            ) : (
              <Link href={mapsUrl || "/calendar"} target={mapsUrl ? "_blank" : undefined} rel={mapsUrl ? "noreferrer" : undefined} className="mt-4 inline-block text-sm font-semibold text-[#b36b3c] hover:underline">View location &rarr;</Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
