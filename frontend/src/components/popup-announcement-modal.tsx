"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

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
  action_type: "none" | "tithe" | "combined_offering" | "13th_sabbath" | "camp_expenses" | "camp_goal" | "local_church_budget" | "respond";
  is_popup: boolean;
  action_prompt?: string;
  published: boolean;
  expires_at?: string;
  created_at: string;
  responses?: AnnouncementResponseItem[];
};

export function PopupAnnouncementModal() {
  const pathname = usePathname();
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState<Announcement | null>(null);
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [responseText, setResponseText] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoggedIn] = useState(() => typeof window !== "undefined" && Boolean(localStorage.getItem("access_token")));

  useEffect(() => {
    const token = localStorage.getItem("access_token");

    fetch(`${API_URL}/api/members/announcements/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Announcement[]) => {
        if (Array.isArray(data)) {
          const pending = data.filter((item) => {
            if (item.is_popup === false) return false;
            const handled = localStorage.getItem(`announcement-handled-${item.id}`);
            return !handled;
          });
          setQueue(pending);
          if (pending.length > 0) {
            setCurrent(pending[0]);
          }
        }
      })
      .catch(() => undefined);
  }, []);

  if (pathname === "/" || !current) return null;

  const actionType = current.action_type || "none";
  const isContributionAction = actionType !== "none" && actionType !== "respond";
  const actionLabel = actionType.replaceAll("_", " ");

  function dismissCurrent() {
    if (!current) return;
    localStorage.setItem(`announcement-handled-${current.id}`, "true");
    const remaining = queue.filter((item) => item.id !== current.id);
    setQueue(remaining);
    setCurrent(remaining.length > 0 ? remaining[0] : null);
  }

  async function handleActionSubmit(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setSubmitting(true);
    setStatusMessage("");

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
        throw new Error(err.detail || "Unable to submit response.");
      }

      localStorage.setItem(`announcement-handled-${current.id}`, "true");

      setPledgeAmount("");
      setResponseText("");
      setName("");
      setPhone("");

      const remaining = queue.filter((item) => item.id !== current.id);
      setQueue(remaining);
      if (remaining.length > 0) {
        setCurrent(remaining[0]);
      } else {
        setCurrent(null);
      }
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-labelledby="announcement-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-[#dfdbd1] bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-center justify-between gap-3 border-b border-[#dfdbd1] pb-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-3 w-3 rounded-full bg-[#b36b3c] animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#b36b3c]">
              Important Announcement
            </span>
          </div>
          {queue.length > 1 && (
            <span className="rounded-full bg-[#26352f]/10 px-3 py-1 text-xs font-semibold text-[#26352f]">
              1 of {queue.length}
            </span>
          )}
        </div>

        <div className="mt-4">
          <h2 id="announcement-modal-title" className="text-xl font-bold text-[#26352f] sm:text-2xl">
            {current.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#415047]">
            {current.text}
          </p>
        </div>

        <form onSubmit={handleActionSubmit} className="mt-6 space-y-4">
          <div className="rounded-2xl border border-[#b36b3c]/30 bg-[#fbf6f0] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#b36b3c]">
              {isContributionAction && `User Action: ${actionLabel} Contribution`}
              {actionType === "respond" && "User Action: Response"}
              {actionType === "none" && "No Action Required"}
            </p>
            <p className="mt-1 text-xs text-[#617068]">
              {current.action_prompt ||
                (isContributionAction
                  ? "You may enter a contribution amount, or dismiss this announcement."
                  : actionType === "respond"
                  ? "You may enter your response, or dismiss this announcement."
                  : "You can dismiss this announcement when you are done reading.")}
            </p>

            {isContributionAction && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">
                    Contribution Amount (KES)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 1000"
                    value={pledgeAmount}
                    onChange={(e) => setPledgeAmount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                  />
                </div>
              </div>
            )}

            {actionType === "respond" && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">
                    Your Response
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Type your message, response, or commitment..."
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                  />
                </div>
              </div>
            )}

            {!isLoggedIn && actionType !== "none" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">
                    Your Name (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">
                    Phone (optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="0712345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                  />
                </div>
              </div>
            )}
          </div>

          {statusMessage && (
            <p className="text-xs font-medium text-red-600">{statusMessage}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={dismissCurrent}
              disabled={submitting}
              className="rounded-2xl border border-[#c9c5bb] bg-white px-5 py-3.5 text-sm font-semibold text-[#617068] transition hover:border-[#b36b3c]"
            >
              Dismiss
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-2xl bg-[#b36b3c] px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#96552e] disabled:opacity-50"
            >
              {submitting ? (
                "Submitting..."
              ) : isContributionAction ? (
                "Submit Contribution Action"
              ) : actionType === "respond" ? (
                "Submit Response & Continue"
              ) : (
                "Done"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
