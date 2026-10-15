/**
 * One month chosen from a grid, the way the desk picks a month.
 *
 * The church writes dd/mm/yyyy and the designee is the church, not the
 * browser: this month grid is day-first (October, not 10), and it reads
 * the same in every locale. `YearPicker` is the same grid under a year.
 */

import { useId, useMemo, useState } from "react";
import type React from "react";

/** One month a member can pick: the name they see, and the ISO month (0-11)
 *  that backs it.
 */
type Month = { label: string; iso: number };

const MONTHS: Month[] = [
  { label: "January", iso: 0 },
  { label: "February", iso: 1 },
  { label: "March", iso: 2 },
  { label: "April", iso: 3 },
  { label: "May", iso: 4 },
  { label: "June", iso: 5 },
  { label: "July", iso: 6 },
  { label: "August", iso: 7 },
  { label: "September", iso: 8 },
  { label: "October", iso: 9 },
  { label: "November", iso: 10 },
  { label: "December", iso: 11 },
];

/**
 * The month picker's contract.
 *
 * The whole caller-facing surface is one whole month, as a string — the only
 * shape a leaf date field or an API will keep.
 */
export interface MonthPickerProps {
  /** The chosen month, as a whole number 1-12 (January = 1). Empty string is
   *  a finished, intentional "nothing selected".
   */
  value: string;
  /** Called with the chosen whole month (1-12), or "" when the pick is
   *  cleared. A half-typed value is held as a draft and never passed up.
   *
   *  @param month whole month 1-12, or "" to clear
   */
  onChange: (month: string) => void;
  /** The year the month sits in, when the caller already knows it. It names
   *  the field for a screen reader and nothing else — a year is never
   *  committed through `onChange`, which carries months only.
   */
  year?: number;
  /** Extra class for the wrapper — crowd it alongside a year field or a date
   *  field without adding a second layer of props.
   */
  className?: string;
}

/** One month, as the member reads it. */
export function Month({ iso }: { iso: number }): string {
  return MONTHS[iso]?.label ?? "";
}

/** A whole month (1-12) as an ISO index (0-11), or null when the value is not
 *  a finished month. Half-typed input is a draft, not a month.
 */
function toISO(value: string): number | null {
  if (value.trim() === "") return null;
  const month = Number(value);
  if (Number.isInteger(month) && month >= 1 && month <= 12) return month - 1;
  return null;
}

/** A single month button: the name, screen-reader confirmation of the exact
 *  month, and `aria-current` on the one that is already chosen.
 */
export function MonthButton({
  month,
  iso,
  selected,
  onSelect,
  fieldId,
}: {
  month: string;
  iso: number;
  selected: boolean;
  onSelect: () => void;
  fieldId: string;
}): React.JSX.Element {
  return (
    <button
      id={`${fieldId}-month-${iso}`}
      aria-label={selected ? `${month} (selected)` : month}
      aria-current={selected ? "true" : undefined}
      type="button"
      onClick={onSelect}
      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-ember/40 sm:px-4 sm:py-2.5 ${
        selected
          ? "border-ember bg-ember/10 text-ember"
          : "border-sand-line bg-sand-plate text-bark hover:border-ember/50 hover:text-bark"
      }`}
    >
      {month}
    </button>
  );
}

export default function MonthPicker({
  value,
  onChange,
  year,
  className = "",
}: MonthPickerProps): React.JSX.Element {
  const fieldId = useId();

  // A month is one of twelve; anything else is a draft held inside the
  // component — an empty string for "nothing chosen", a partial number for
  // "still typing". The caller only ever sees a finished month.
  const [draft, setDraft] = useState<string>(value);

  const selectedISO = useMemo(() => toISO(draft), [draft]);

  /** A whole, finished month — the only shape the caller is told about. */
  const commit = (month: string): void => {
    setDraft(month);
    onChange(month);
  };

  /**
   * A typed month is committed the moment it is whole.
   *
   * The draft field is a real way in, not a decoration: someone who types "3"
   * and tabs away means March. A half-typed or out-of-range value is left as
   * a draft — the caller is never handed "1" from a half-written "12".
   */
  const commitIfWhole = (): void => {
    const iso = toISO(draft);
    if (iso !== null) commit(String(iso + 1));
  };

  return (
    <div className={`grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2 ${className}`}>
      {MONTHS.map(({ label, iso }) => (
        <MonthButton
          key={iso}
          month={label}
          iso={iso}
          selected={selectedISO === iso}
          onSelect={() => commit(String(iso + 1))}
          fieldId={fieldId}
        />
      ))}

      <input
        aria-label={year ? `Month in ${year}` : "Month"}
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitIfWhole}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitIfWhole();
          }
        }}
        placeholder="mm"
        className="col-span-4 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:col-span-6"
      />
    </div>
  );
}
