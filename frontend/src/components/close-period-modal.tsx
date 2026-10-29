"use client";

import { FormEvent, useState } from "react";
import { CalendarDays, Loader2, Lock, X } from "lucide-react";
import { localDate } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One reporting period as the treasury desk reads it. */
export type TreasuryPeriodWindow = {
  id: number | null;
  /** The close before it — null for the church's first period. */
  started_at: string | null;
  /** Its own close — null while the period is still open. */
  closed_at: string | null;
  closed_by: string;
  note: string;
  is_open: boolean;
};

/**
 * The church's clock: a close is named in Meru's own time, not in whatever
 * zone the browser reading it happens to sit in. Nairobi keeps UTC+3 all
 * year, so the offset the sheet submits is fixed.
 */
const CHURCH_TZ = "Africa/Nairobi";
const CHURCH_OFFSET = "+03:00";

const pad = (value: number) => String(value).padStart(2, "0");

/** The church's date and clock a stored close reads as. */
export function closeParts(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHURCH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    // A clock reads 00–23, never the "24" some locales print for midnight.
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const find = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = find("hour") === "24" ? "00" : find("hour");
  return {
    date: `${find("year")}-${find("month")}-${find("day")}`,
    time: `${hour}:${find("minute")}`,
  };
}

/**
 * The day a close leaves in the period before it.
 *
 * A report is read by the day, and a close at midnight ends the period at the
 * start of that day — so the last day it covers is the day before. A close
 * named at some hour of the day covers that day up to the hour, which the
 * desk reads as the whole day.
 */
export function closingDay(iso: string): string {
  const { date, time } = closeParts(iso);
  if (time !== "00:00") return date;
  const previous = new Date(`${date}T00:00:00${CHURCH_OFFSET}`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: CHURCH_TZ }).format(previous);
}

/**
 * The Close Period sheet.
 *
 * Closing names the instant the books stop: the period being read ends there
 * and the next one opens, so the report that follows runs from this close to
 * the next. The treasurer either schedules that instant or closes now; either
 * way the same instant is what an Edit Close moves afterwards, when a gift
 * landed on the wrong side of the cut-off.
 */
export function ClosePeriodModal({
  mode,
  period,
  onClose,
  onSaved,
}: {
  /** "close" ends the open period; "edit" moves a close already on record. */
  mode: "close" | "edit";
  /** The period whose close is being edited (mode "edit"). */
  period?: TreasuryPeriodWindow | null;
  onClose: () => void;
  onSaved: (payload: { period: TreasuryPeriodWindow | null; periods: TreasuryPeriodWindow[] }) => void;
}) {
  // The sheet opens on the period it was called for: a close being edited
  // shows the instant already on the record, a fresh close opens on today at
  // midnight — the day the desks count, before any of it has happened. The
  // caller mounts the sheet afresh each time it is opened, so these defaults
  // are read once and never need an effect to reset them.
  const recorded = mode === "edit" && period?.closed_at ? closeParts(period.closed_at) : null;
  const [choice, setChoice] = useState<"schedule" | "now">("schedule");
  const [date, setDate] = useState(recorded?.date ?? localDate());
  const [time, setTime] = useState(recorded?.time ?? "00:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const headers = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    // "Close now" is the instant of the click; a scheduled close is the day
    // and hour named, read in this browser's own clock and sent as an instant
    // so the server never has to guess the church's time zone.
    const closedAt =
      mode === "close" && choice === "now"
        ? new Date().toISOString()
        : new Date(`${date}T${time}:00${CHURCH_OFFSET}`).toISOString();
    setSaving(true);
    try {
      const editing = mode === "edit" && period?.id;
      const response = await fetch(
        editing
          ? `${API_URL}/api/members/treasury/periods/${period?.id}/`
          : `${API_URL}/api/members/treasury/periods/`,
        {
          method: editing ? "PATCH" : "POST",
          headers: headers(),
          body: JSON.stringify({ closed_at: closedAt }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail =
          data?.closed_at?.[0] ||
          data?.closed_at ||
          data?.detail ||
          "The period could not be closed. Please try again.";
        throw new Error(String(detail));
      }
      onSaved({
        period: (data?.period as TreasuryPeriodWindow) ?? null,
        periods: Array.isArray(data?.periods) ? (data.periods as TreasuryPeriodWindow[]) : [],
      });
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The period could not be closed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-sand-line"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-sand-line px-5 pb-3.5 pt-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-bark">
              <Lock className="h-4 w-4 text-ember" aria-hidden="true" />
              {mode === "edit" ? "Edit Period" : "Close Period"}
            </h2>
            <p className="mt-1 text-xs leading-5 text-moss">
              {mode === "edit"
                ? "Move this period's close so a gift cut off at the wrong side of it lands in the period it belongs to."
                : "Close the books at this instant. The period ends here, the next report opens here, and the from date follows it."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-moss transition hover:bg-sand hover:text-bark"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {mode === "close" && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-moss">When</span>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${choice === "schedule" ? "border-ember bg-sand-linen" : "border-sand-mute bg-white"}`}>
                  <input
                    type="radio"
                    name="close-when"
                    value="schedule"
                    checked={choice === "schedule"}
                    onChange={() => setChoice("schedule")}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-ember)]"
                  />
                  <span>
                    <span className="block font-semibold text-bark">Schedule close</span>
                    <span className="block text-xs text-moss">Name the day and hour the books stop.</span>
                  </span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${choice === "now" ? "border-ember bg-sand-linen" : "border-sand-mute bg-white"}`}>
                  <input
                    type="radio"
                    name="close-when"
                    value="now"
                    checked={choice === "now"}
                    onChange={() => setChoice("now")}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-ember)]"
                  />
                  <span>
                    <span className="block font-semibold text-bark">Close now</span>
                    <span className="block text-xs text-moss">Close it at this minute, with nothing left out.</span>
                  </span>
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-bark">
                Date
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  disabled={mode === "close" && choice === "now"}
                  className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm font-normal outline-none focus:border-ember disabled:bg-sand disabled:text-moss"
                />
              </label>
              <label className="text-xs font-semibold text-bark">
                Time
                <input
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  disabled={mode === "close" && choice === "now"}
                  className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm font-normal outline-none focus:border-ember disabled:bg-sand disabled:text-moss"
                />
              </label>
            </div>

            <p className="flex items-start gap-2 rounded-xl bg-sand px-3 py-2.5 text-[11px] leading-5 text-moss">
              <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ember" aria-hidden="true" />
              <span>
                {mode === "edit"
                  ? "Moving the close re-cuts the period either side of it. Nothing is rewritten — every report is read from these instants."
                  : "The next report will begin where this one ends, and the from date resets to it."}
              </span>
            </p>

            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-sand-line px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-sand-mute bg-white px-3.5 py-2 text-xs font-semibold text-bark transition hover:bg-sand"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark disabled:opacity-60"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {mode === "edit" ? "Save" : "Close Period"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
