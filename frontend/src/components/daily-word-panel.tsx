"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { dayFirst } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One day's word, as the endpoint reports it. */
type DailyWordRow = {
  id: number;
  date: string;
  text: string;
  author_name: string;
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * The daily word: a short devotional thought for the day.
 *
 * Any signed-in member reads it — a thought meant to be shared reads like
 * one — but the pen is the eldership desk's: only they write, and a day
 * holds one word, so posting again replaces today's thought rather than
 * stacking a second. Yesterday's words stay below, so what the church has
 * been fed does not vanish when the day turns over.
 */
export function DailyWordPanel() {
  const [today, setToday] = useState<DailyWordRow | null>(null);
  const [recent, setRecent] = useState<DailyWordRow[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/members/daily-word/`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as { today: DailyWordRow | null; recent: DailyWordRow[]; can_write: boolean };
      setToday(data.today ?? null);
      setRecent((data.recent || []).filter((row) => row.date !== data.today?.date));
      setCanWrite(Boolean(data.can_write));
    } catch {
      /* the panel keeps what it had */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(async () => {
      if (!alive) return;
      await reload();
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  const share = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/members/daily-word/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.text || "The word could not be shared.");
      showAlert("Shared", "Today's word is with the church.", "success", {
        toast: true,
        timer: 4000,
        showConfirmButton: false,
      });
      setDraft("");
      await reload();
    } catch (error) {
      showAlert("Could not share", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col">
      {today ? (
        <article className="rounded-xl border border-sand-line bg-sand-linen px-4 py-3.5">
          <p className="text-[11px] font-semibold text-ember">Today&apos;s word</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-bark">{today.text}</p>
          {today.author_name && (
            <p className="mt-2 text-[11px] text-moss">— {today.author_name}</p>
          )}
        </article>
      ) : (
        <p className="rounded-xl border border-dashed border-sand-line px-4 py-3.5 text-xs text-moss">
          No word has been shared for today yet.
        </p>
      )}

      {canWrite && (
        <div className="mt-3 rounded-xl border border-sand-line bg-sand p-3">
          <label className="block text-xs font-semibold text-bark">
            {today ? "Replace today's word" : "Write today's word"}
          </label>
          <textarea
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="A short thought for the day."
            className="mt-1.5 w-full rounded-xl border border-sand-line bg-white px-3 py-2.5 text-xs focus:border-ember focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void share()}
            disabled={sending || !draft.trim()}
            className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            {sending ? "Sharing…" : today ? "Update today's word" : "Share with the church"}
          </button>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold text-bark">Earlier words</h3>
          <ul className="mt-2 space-y-2">
            {recent.map((row) => (
              <li key={row.id} className="rounded-xl border border-sand-line bg-white px-3.5 py-2.5">
                <p className="text-[11px] font-semibold text-ember">{dayFirst(row.date)}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-bark">{row.text}</p>
                {row.author_name && <p className="mt-1 text-[11px] text-moss">— {row.author_name}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
