"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";

/**
 * A date filter that reads the way the desk reads dates: ddmmyyyy.
 *
 * The native date input renders in the browser's locale — mm/dd/yyyy on an
 * en-US machine — which sent at least one treasurer reading day and month the
 * wrong way round. This field keeps the ISO value the API speaks (yyyy-mm-dd)
 * on the outside and formats it for the eye on the inside; an unparseable
 * draft is held locally and never reaches the caller, so half-typed dates
 * cannot filter the list into nonsense.
 *
 * The calendar beside the text is the browser's own picker, opened by the
 * icon: picking a day hands over the ISO date straight away, while the text
 * field keeps accepting ddmmyyyy typed by hand. A complete valid date is
 * committed the moment its eighth digit lands, and a finished draft is also
 * committed on blur rather than thrown away.
 */
export function DateField({
  value,
  onChange,
  label,
  className = "",
}: {
  /** ISO yyyy-mm-dd (or empty). */
  value: string;
  /** Receives ISO yyyy-mm-dd (or '' when cleared). */
  onChange: (iso: string) => void;
  /** Screen-reader label, e.g. "Expenditures from date". */
  label: string;
  className?: string;
}) {
  const isoToDisplay = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? `${m[3]}${m[2]}${m[1]}` : "";
  };
  // What the member is mid-way through typing. Null means the field simply
  // shows the caller's own value, so a change from outside (a preset window,
  // a reset) reaches the eye without any effect to copy it across — and a
  // draft in progress is never stomped.
  const [draft, setDraft] = useState<string | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  /** The text this raw input leaves behind; null once a valid date is handed over. */
  const handle = (raw: string): string | null => {
    const digits = raw.replace(/[^\d]/g, "").slice(0, 8);
    const d = digits.slice(0, 2);
    const mo = digits.slice(2, 4);
    const y = digits.slice(4, 8);
    if (digits.length < 8) return `${d}${mo}${y}`; // still typing
    const year = Number(y);
    const month = Number(mo);
    const day = Number(d);
    if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return `${d}${mo}${y}`;
    onChange(`${y}-${mo}-${d}`);
    return null; // complete and valid — show the caller's value again
  };

  /** A finished draft gets its last word on blur: valid commits, stale discards. */
  const commitDraft = () => {
    if (draft !== null) {
      const digits = draft.replace(/[^\d]/g, "");
      if (digits.length === 8) {
        const [d, mo, y] = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)];
        const year = Number(y);
        const month = Number(mo);
        const day = Number(d);
        if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          onChange(`${y}-${mo}-${d}`);
        }
      }
      setDraft(null);
    }
  };

  /** The icon's one job: raise the browser's own calendar on this field. */
  const openCalendar = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    if (typeof picker.showPicker === "function") {
      try {
        picker.showPicker();
        return;
      } catch {
        // Older Safari refuses a programmatic open; focusing still works.
      }
    }
    picker.focus();
    picker.click();
  };

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      {/* The real calendar, kept invisible: the icon raises it, a chosen day
          hands its date straight to the caller. */}
      <input
        ref={pickerRef}
        type="date"
        value={value}
        aria-label={`${label}: calendar`}
        onChange={(event) => {
          setDraft(null);
          onChange(event.target.value);
        }}
        className="pointer-events-none absolute right-1 top-1/2 h-px w-px -translate-y-1/2 opacity-0"
      />
      <input
        type="text"
        inputMode="numeric"
        value={draft ?? isoToDisplay(value)}
        onChange={(e) => setDraft(handle(e.target.value))}
        onBlur={commitDraft}
        placeholder="ddmmyyyy"
        aria-label={label}
        className="w-[6.75rem] rounded-xl border border-sand-mute bg-white py-1 pl-2 pr-7 text-xs outline-none focus:border-ember"
      />
      <button
        type="button"
        onClick={openCalendar}
        aria-label={`${label}: open calendar`}
        title="Pick from calendar"
        className="absolute right-0 inset-y-0 grid w-7 place-items-center text-moss transition hover:text-ember"
      >
        <CalendarDays size={13} aria-hidden="true" />
      </button>
    </span>
  );
}
