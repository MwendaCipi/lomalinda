"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type AnnouncementResponseItem = {
  id: number;
  action_type: string;
  pledge_amount?: string | number;
  response_text?: string;
  respondent_name?: string;
  created_at: string;
};

type Announcement = {
  id: number;
  title: string;
  text: string;
  detail?: string;
  href?: string;
  visibility: string;
  action_type: "acknowledge" | "pledge" | "respond";
  is_popup: boolean;
  action_prompt?: string;
  published: boolean;
  expires_at?: string;
  created_at: string;
  responses?: AnnouncementResponseItem[];
};

type ChurchSettings = {
  clarion_call_heading?: string;
  clarion_call_subtext?: string;
};

export function HeroAnnouncementSection() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [settings, setSettings] = useState<ChurchSettings | null>(null);

  // Form states for interactive action responses
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [responseText, setResponseText] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    // Fetch announcements
    fetch(`${API_URL}/api/members/announcements/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Announcement[]) => {
        if (Array.isArray(data)) {
          const active = data.filter((item) => {
            const handled = localStorage.getItem(`announcement-handled-${item.id}`);
            return !handled;
          });
          setItems(active);
        }
      })
      .catch(() => undefined);

    // Fetch church settings for custom clarion call
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ChurchSettings) => {
        if (data) setSettings(data);
      })
      .catch(() => undefined);
  }, []);

  // Auto-slideplay effect for announcements carousel
  useEffect(() => {
    if (items.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % items.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [items.length, isPaused]);

  const current = items[activeIdx] ?? items[0];
  const actionType = current?.action_type || "acknowledge";

  const handleNext = () => setActiveIdx((prev) => (prev + 1) % items.length);
  const handlePrev = () => setActiveIdx((prev) => (prev - 1 + items.length) % items.length);

  async function handleActionSubmit(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setSubmitting(true);
    setStatusMessage("");
    setSuccessMessage("");

    try {
      const token = localStorage.getItem("access_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const payload = {
        action_type: actionType,
        pledge_amount: pledgeAmount ? parseFloat(pledgeAmount) : null,
        response_text: responseText,
        respondent_name: name,
        respondent_phone: phone,
      };

      const res = await fetch(`${API_URL}/api/members/announcements/${current.id}/action/`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Unable to submit action.");
      }

      localStorage.setItem(`announcement-handled-${current.id}`, "true");

      setSuccessMessage("Thank you! Your action has been recorded.");
      setPledgeAmount("");
      setResponseText("");
      setName("");
      setPhone("");

      setTimeout(() => {
        setSuccessMessage("");
        const remaining = items.filter((item) => item.id !== current.id);
        setItems(remaining);
        if (activeIdx >= remaining.length) {
          setActiveIdx(Math.max(0, remaining.length - 1));
        }
      }, 1200);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  // Render Announcement Carousel when announcements exist for the week
  if (items.length > 0 && current) {
    return (
      <div>
        <div
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          className="rounded-3xl border border-[#dfdbd1] bg-[#26352f] p-6 text-white shadow-md sm:p-8"
        >
          {/* Header Bar with Slide Counter & Next/Prev Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#f1c89e] animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-[#f1c89e]">
                Announcement {items.length > 1 ? `${activeIdx + 1} of ${items.length}` : ""}
              </span>
            </div>

            {items.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/5 text-sm transition hover:bg-white/20"
                  aria-label="Previous announcement"
                >
                  &larr;
                </button>

                {/* Dot Indicators */}
                <div className="flex items-center gap-1.5 px-1">
                  {items.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveIdx(idx)}
                      aria-label={`Go to announcement ${idx + 1}`}
                      className={`h-2 rounded-full transition-all ${
                        idx === activeIdx ? "w-5 bg-[#f1c89e]" : "w-2 bg-white/30"
                      }`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleNext}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/5 text-sm transition hover:bg-white/20"
                  aria-label="Next announcement"
                >
                  &rarr;
                </button>
              </div>
            )}
          </div>

          {/* Slide Content */}
          <div className="mt-5">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {current.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/80 sm:text-base">
              {current.text}
            </p>
            {current.detail && (
              <p className="mt-2 text-xs leading-relaxed text-white/60">
                {current.detail}
              </p>
            )}
          </div>

          {/* Interactive Response / Action Section */}
          <div className="mt-6 border-t border-white/10 pt-5">
            {successMessage ? (
              <div className="rounded-xl bg-[#5f8067] p-3 text-center text-sm font-semibold text-white">
                {successMessage}
              </div>
            ) : (
              <form onSubmit={handleActionSubmit} className="space-y-3">
                {actionType === "pledge" && (
                  <div>
                    <label className="block text-xs font-semibold text-white/80">
                      Pledge Amount (KES)
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="e.g. 5000"
                      value={pledgeAmount}
                      onChange={(e) => setPledgeAmount(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-[#f1c89e]"
                    />
                  </div>
                )}

                {actionType === "respond" && (
                  <div>
                    <label className="block text-xs font-semibold text-white/80">
                      {current.action_prompt || "Your Response"}
                    </label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Write your response..."
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-[#f1c89e]"
                    />
                  </div>
                )}

                {(actionType === "pledge" || actionType === "respond") && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      placeholder="Your Name (optional)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-[#f1c89e]"
                    />
                    <input
                      type="tel"
                      placeholder="Phone Number (optional)"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-[#f1c89e]"
                    />
                  </div>
                )}

                {statusMessage && (
                  <p className="text-xs text-red-300">{statusMessage}</p>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full bg-[#b36b3c] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#96552e] disabled:opacity-60"
                  >
                    {submitting
                      ? "Submitting..."
                      : actionType === "pledge"
                      ? "Submit Pledge"
                      : actionType === "respond"
                      ? "Send Response"
                      : "Acknowledge"}
                  </button>

                  {current.href && (
                    <a
                      href={current.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-white/30 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10"
                    >
                      Learn More &rarr;
                    </a>
                  )}

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="ml-auto text-xs font-medium text-white/60 hover:text-white"
                    >
                      Next announcement &rarr;
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>

        {/* CTA links available below announcement */}
        <div className="hero-line mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-4 sm:max-w-xl">
          <Link href="#contact" className="flex items-center justify-center rounded-full border border-[#c9c5bb] bg-white px-4 py-3 text-center text-sm font-medium transition hover:border-[#26352f] hover:bg-[#eae6de] sm:py-3.5 sm:text-base">Location & Contacts</Link>
          <Link href="/calendar" className="flex items-center justify-center rounded-full border border-[#c9c5bb] bg-white px-4 py-3 text-center text-sm font-medium transition hover:border-[#26352f] hover:bg-[#eae6de] sm:py-3.5 sm:text-base">See Our Calendar</Link>
        </div>
      </div>
    );
  }

  // Default Fallback: Clarion Call (when no announcements exist for the week)
  const defaultHeadingLines = [
    "A place to belong.",
    "A faith to share.",
    "A hope that transforms lives."
  ];

  const headingText = settings?.clarion_call_heading?.trim() || "";
  const headingLines = headingText
    ? headingText.split("\n")
    : defaultHeadingLines;

  const subtext =
    settings?.clarion_call_subtext ||
    "Join Loma Linda SDA Church, Meru as we study God's Word, support one another, and reach out to our community with faith and compassion.";

  return (
    <div>
      <h1 className="mt-4 text-3xl font-semibold leading-[1.15] tracking-tight sm:mt-6 sm:text-6xl">
        {headingLines.map((line, idx) => (
          <span key={idx} className="hero-line block">
            {line}
          </span>
        ))}
      </h1>
      <p className="hero-line hidden sm:block mt-5 text-base leading-7 text-[#617068] sm:mt-7 sm:text-lg sm:leading-8">
        {subtext}
      </p>
      <div className="hero-line mt-6 grid grid-cols-1 gap-3 sm:mt-9 sm:grid-cols-2 sm:gap-4 sm:max-w-xl">
        <Link
          href="#contact"
          className="flex items-center justify-center rounded-full border border-[#c9c5bb] bg-white px-4 py-3 text-center text-sm font-medium transition hover:border-[#26352f] hover:bg-[#eae6de] sm:py-3.5 sm:text-base"
        >
          Location & Contacts
        </Link>
        <Link
          href="/calendar"
          className="flex items-center justify-center rounded-full border border-[#c9c5bb] bg-white px-4 py-3 text-center text-sm font-medium transition hover:border-[#26352f] hover:bg-[#eae6de] sm:py-3.5 sm:text-base"
        >
          See Our Calendar
        </Link>
      </div>
    </div>
  );
}
