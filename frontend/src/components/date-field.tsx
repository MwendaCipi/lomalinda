"use client";

import { useState } from "react";

/**
 * A date filter that reads the way the desk reads dates: dd/mm/yyyy.
 *
 * The native date input renders in the browser's locale — mm/dd/yyyy on an
 * en-US machine — which sent at least one treasurer reading day and month the
 * wrong way round. This field keeps the ISO value the API speaks (yyyy-mm-dd)
 * on the outside and formats it for the eye on the inside; an unparseable
 * draft is held locally and never reaches the caller, so half-typed dates
 * cannot filter the list into nonsense.
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
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  };
  // What the member is mid-way through typing. Null means the field simply
  // shows the caller's own value, so a change from outside (a preset window,
  // a reset) reaches the eye without any effect to copy it across — and a
  // draft in progress is never stomped.
  const [draft, setDraft] = useState<string | null>(null);

  /** The text this raw input leaves behind; null once a valid date is handed over. */
  const handle = (raw: string): string | null => {
    const digits = raw.replace(/[^\d]/g, "").slice(0, 8);
    const d = digits.slice(0, 2);
    const mo = digits.slice(2, 4);
    const y = digits.slice(4, 8);
    if (digits.length < 8) return [d, mo, y].filter(Boolean).join("/"); // still typing
    const year = Number(y);
    const month = Number(mo);
    const day = Number(d);
    if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return `${d}/${mo}/${y}`;
    onChange(`${y}-${mo}-${d}`);
    return null; // complete and valid — show the caller's value again
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft ?? isoToDisplay(value)}
      onChange={(e) => setDraft(handle(e.target.value))}
      onBlur={() => setDraft(null)}
      placeholder="dd/mm/yyyy"
      aria-label={label}
      className={`rounded-xl border border-sand-mute bg-white px-2 py-1 text-xs outline-none focus:border-ember ${className}`}
    />
  );
}
