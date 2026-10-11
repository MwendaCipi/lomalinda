"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, CheckCheck, ArrowRightLeft } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type LessonRequestRow = {
  id: number;
  lesson: string;
  note: string;
  status: string;
  created_at: string;
  served_at: string;
  served_by_name: string;
  member_name: string;
  mine: boolean;
};

type QueueResponse = {
  requests: LessonRequestRow[];
  can_serve: boolean;
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function LessonRequestsPanel() {
  const [requests, setRequests] = useState<LessonRequestRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "sending" | "answering">("idle");
  const [formNote, setFormNote] = useState("");
  const [formLesson, setFormLesson] = useState("");
  const [servingId, setServingId] = useState<number | null>(null);
  const [canServe, setCanServe] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/members/lesson-requests/`, { headers: authHeaders() });
      const data = (await res.json()) as QueueResponse;
      setRequests(data.requests);
      setCanServe(Boolean(data.can_serve));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // The state writes ride a microtask — the same shape the roll and
    // calendar loads use — so the effect's own body never writes state.
    let alive = true;
    void Promise.resolve().then(async () => {
      if (!alive) return;
      await reload();
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  const send = async () => {
    if (!formLesson.trim()) return;
    setStatus("sending");
    try {
      const res = await fetch(`${API_URL}/api/members/lesson-requests/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ lesson: formLesson.trim(), note: formNote.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "The request could not be sent.");
      showAlert("Sent", "Your request is with the Sabbath School leadership.", "success", {
        toast: true,
        timer: 4000,
        showConfirmButton: false,
      });
      setFormLesson("");
      setFormNote("");
      void reload();
    } catch (error) {
      showAlert("Could not send", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setStatus("idle");
    }
  };

  const serve = async (id: number) => {
    setServingId(id);
    try {
      const res = await fetch(`${API_URL}/api/members/lesson-requests/${id}/serve/`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("The request could not be marked as served.");
      showAlert("Served", "The lesson request is marked as served.", "success", {
        toast: true,
        timer: 3000,
        showConfirmButton: false,
      });
      void reload();
    } catch (error) {
      showAlert("Could not serve", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setServingId(null);
    }
  };

  const rows = requests
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-bark">
            {canServe ? "Queue" : "Your requests"}
          </h3>
          <p className="mt-0.5 text-[11px] text-moss">
            {canServe
              ? `${requests.length} waiting for the school`
              : `You have ${requests.length} request${requests.length === 1 ? "" : "s"} waiting`}
          </p>
        </div>
      </div>

      {status === "loading" ? (
        <p className="mt-2 text-center text-xs text-moss">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-center text-xs text-moss">
          {canServe ? "No lesson requests yet." : "No lesson requests from you yet."}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-sand-line bg-sand-linen px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand-card text-xs font-bold text-ember">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-bark">{row.lesson}</p>
                  <p className="truncate text-[11px] text-moss">
                    {row.note || "No note."}
                    {row.member_name && row.member_name !== row.lesson
                      ? ` · From ${row.member_name}`
                      : ""}
                  </p>
                  <p className="text-[11px] text-moss-faint">
                    {row.status === "served" ? "Served" : "Awaiting"} · {new Date(row.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex shrink-0 items-center gap-2">
                {row.status === "served" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Served by {row.served_by_name}
                  </span>
                ) : canServe ? (
                  <button
                    type="button"
                    onClick={() => serve(row.id)}
                    disabled={servingId === row.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ember px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    {servingId === row.id ? "Serving…" : "Serve"}
                  </button>
                ) : (
                  <span className="text-[11px] text-moss-faint">Needs the school&apos;s desk</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!canServe ? (
        <p className="mt-3 text-center text-[11px] text-moss">
          Only the Sabbath School superintendent (area Leader) can serve
          requests from behind this card.
        </p>
      ) : (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="flex-1">
            <label className="text-[11px] font-semibold text-bark">
              Name the lesson you would like studied
            </label>
            <input
              value={formLesson}
              onChange={(event) => setFormLesson(event.target.value)}
              placeholder="e.g. The 28 Fundamental Truths"
              className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs outline-none focus:border-ember"
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] font-semibold text-bark">
              Optional note
            </label>
            <input
              value={formNote}
              onChange={(event) => setFormNote(event.target.value)}
              placeholder="Why this lesson matters to you…"
              className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs outline-none focus:border-ember"
            />
          </div>
          <button
            type="submit"
            disabled={status === "sending" || !formLesson.trim()}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-ember px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            {status === "sending" ? "Sending…" : "Send request"}
          </button>
        </form>
      )}
    </div>
  );
}
