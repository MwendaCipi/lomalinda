"use client";

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

/**
 * The week's announcements, shown as a card beside the hero.
 *
 * Announcements used to replace the hero itself, which meant the church's
 * clarion call vanished whenever something was published. They now live in
 * their own card, so the hero stays constant and each announcement can still
 * ask for a pledge, a response or a simple acknowledgement.
 */
export function AnnouncementCard() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [responseText, setResponseText] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    fetch(`${API_URL}/api/members/announcements/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Announcement[]) => {
        if (!Array.isArray(data)) return;
        setItems(
          data.filter((item) => !localStorage.getItem(`announcement-handled-${item.id}`)),
        );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (items.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % items.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [items.length, isPaused]);

  const current = items[activeIdx] ?? items[0];
  const actionType = current?.action_type || "acknowledge";

  function handleNext() {
    setActiveIdx((prev) => (prev + 1) % items.length);
  }

  function handlePrev() {
    setActiveIdx((prev) => (prev - 1 + items.length) % items.length);
  }

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

      const res = await fetch(`${API_URL}/api/members/announcements/${current.id}/action/`, {
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

  // Nothing published this week: leave the hero and the gathering card to speak.
  if (items.length === 0 || !current) return null;

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-[#dfdbd1] sm:p-9"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfdbd1] pb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#b36b3c]" />
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">
            Announcement{items.length > 1 ? ` ${activeIdx + 1} of ${items.length}` : ""}
          </span>
        </div>

        {items.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dfdbd1] text-sm text-[#617068] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
              aria-label="Previous announcement"
            >
              &larr;
            </button>
            <div className="flex items-center gap-1.5 px-1">
              {items.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  aria-label={`Go to announcement ${idx + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    idx === activeIdx ? "w-5 bg-[#b36b3c]" : "w-2 bg-[#dfdbd1]"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleNext}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dfdbd1] text-sm text-[#617068] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
              aria-label="Next announcement"
            >
              &rarr;
            </button>
          </div>
        )}
      </div>

      <div className="mt-5">
        <h2 className="text-2xl font-semibold tracking-tight">{current.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-[#617068] sm:text-base">{current.text}</p>
        {current.detail && <p className="mt-2 text-xs leading-relaxed text-[#8d938e]">{current.detail}</p>}
      </div>

      <div className="mt-6 border-t border-[#dfdbd1] pt-5">
        {successMessage ? (
          <div className="rounded-xl bg-[#eef2ed] p-3 text-center text-sm font-semibold text-[#3d5148]">
            {successMessage}
          </div>
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
                  onChange={(event) => setPledgeAmount(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3 py-2 text-sm text-[#26352f] outline-none focus:border-[#b36b3c] focus:bg-white"
                />
              </div>
            )}

            {actionType === "respond" && (
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">
                  {current.action_prompt || "Your Response"}
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Write your response..."
                  value={responseText}
                  onChange={(event) => setResponseText(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3 py-2 text-sm text-[#26352f] outline-none focus:border-[#b36b3c] focus:bg-white"
                />
              </div>
            )}

            {(actionType === "pledge" || actionType === "respond") && (
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Your Name (optional)"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3 py-2 text-xs text-[#26352f] outline-none focus:border-[#b36b3c] focus:bg-white"
                />
                <input
                  type="tel"
                  placeholder="Phone Number (optional)"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3 py-2 text-xs text-[#26352f] outline-none focus:border-[#b36b3c] focus:bg-white"
                />
              </div>
            )}

            {statusMessage && <p className="text-xs text-red-600">{statusMessage}</p>}

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
                  className="rounded-full border border-[#c9c5bb] px-4 py-2.5 text-xs font-semibold text-[#26352f] transition hover:border-[#b36b3c]"
                >
                  Learn More &rarr;
                </a>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
