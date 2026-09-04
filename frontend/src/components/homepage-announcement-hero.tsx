"use client";

import { FormEvent, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

export function HomepageAnnouncementHero() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [responseText, setResponseText] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) setIsLoggedIn(true);

    fetch(`${API_URL}/api/members/announcements/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Announcement[]) => {
        if (Array.isArray(data)) {
          // Filter unhandled active announcements
          const active = data.filter((item) => {
            const handled = localStorage.getItem(`announcement-handled-${item.id}`);
            return !handled;
          });
          setItems(active);
        }
      })
      .catch(() => undefined);
  }, []);

  if (items.length === 0) return null;

  const current = items[activeIdx] ?? items[0];
  const actionType = current.action_type || "acknowledge";

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

      // Mark handled
      localStorage.setItem(`announcement-handled-${current.id}`, "true");

      setSuccessMessage("Thank you! Your action has been recorded.");
      setPledgeAmount("");
      setResponseText("");
      setName("");
      setPhone("");

      // Delay briefly to show success, then remove from items list
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

  return (
    <section aria-label="Featured Announcement" className="border-b border-[#dfdbd1] bg-[#26352f] px-6 py-8 text-white lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#f1c89e] animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-[#f1c89e]">
              Featured Announcement
            </span>
          </div>

          {items.length > 1 && (
            <div className="flex items-center gap-1.5">
              {items.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`View announcement ${idx + 1}`}
                  onClick={() => setActiveIdx(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === activeIdx ? "w-6 bg-[#f1c89e]" : "w-2 bg-white/30"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          {/* Announcement Information */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {current.title}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-white/90 sm:text-lg">
              {current.text}
            </p>
            {current.detail && (
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                {current.detail}
              </p>
            )}
          </div>

          {/* Action Form Container */}
          <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md sm:p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#f1c89e]">
              {actionType === "pledge" && "Make a Pledge"}
              {actionType === "respond" && "Send Response / Feedback"}
              {actionType === "acknowledge" && "Acknowledge Announcement"}
            </h3>
            <p className="mt-1 text-xs text-white/80">
              {current.action_prompt ||
                (actionType === "pledge"
                  ? "Enter your pledge amount below to support this initiative."
                  : actionType === "respond"
                  ? "Type your message or response below."
                  : "Click below to acknowledge reading this announcement.")}
            </p>

            <form onSubmit={handleActionSubmit} className="mt-4 space-y-3">
              {actionType === "pledge" && (
                <div>
                  <label className="block text-xs font-semibold text-white">
                    Pledge Amount (KES) <span className="text-[#f1c89e]">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 1000"
                    value={pledgeAmount}
                    onChange={(e) => setPledgeAmount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/30 bg-white/10 px-3.5 py-2 text-sm text-white placeholder-white/50 outline-none focus:border-[#f1c89e]"
                  />
                </div>
              )}

              {actionType === "respond" && (
                <div>
                  <label className="block text-xs font-semibold text-white">
                    Your Response <span className="text-[#f1c89e]">*</span>
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Type your response..."
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/30 bg-white/10 px-3.5 py-2 text-sm text-white placeholder-white/50 outline-none focus:border-[#f1c89e]"
                  />
                </div>
              )}

              {!isLoggedIn && actionType !== "acknowledge" && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-white/90">
                      Your Name
                    </label>
                    <input
                      type="text"
                      placeholder="Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs text-white placeholder-white/50 outline-none focus:border-[#f1c89e]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/90">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs text-white placeholder-white/50 outline-none focus:border-[#f1c89e]"
                    />
                  </div>
                </div>
              )}

              {statusMessage && (
                <p className="text-xs font-medium text-red-300">{statusMessage}</p>
              )}
              {successMessage && (
                <p className="text-xs font-semibold text-[#f1c89e]">{successMessage}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[#b36b3c] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-50"
              >
                {submitting ? (
                  "Submitting..."
                ) : actionType === "pledge" ? (
                  "Submit Pledge"
                ) : actionType === "respond" ? (
                  "Submit Response"
                ) : (
                  "Acknowledge & Continue"
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
