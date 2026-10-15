import type React from "react";
import MonthPicker from "./month-picker";

/**
 * The year picker is the month grid under the year it belongs to.
 *
 * The year is the frame, not a second question: the office is answering for
 * one month, so this screen shows the year it is working in and hands back
 * the month the moment it is confirmed. Twelve month buttons under a year
 * heading is the whole control — there is no separate year grid to keep in
 * step with it, and no way for the two to disagree.
 */
export default function YearPicker({
  year,
  month,
  onChange,
  className = "",
}: {
  /** The year the screen is working in. */
  year: number;
  /** The month the office is answering for, shown as chosen in the grid.
   *  Absent until the office has picked one.
   */
  month?: number;
  /** Receives the month the office is answering for, or "" to clear it.
   *
   *  @param month whole month 1-12, or "" to clear
   */
  onChange: (month: string) => void;
  /** Extra class for the wrapper — crowd it alongside a date field without
   *  adding a second layer of props.
   */
  className?: string;
}): React.JSX.Element {
  // What is already on the ledger, so the office does not type it twice.
  const onFile =
    month !== undefined && month >= 1 && month <= 12
      ? `Month already on file: ${new Intl.DateTimeFormat("en-GB", {
          month: "long",
          timeZone: "Africa/Nairobi",
        }).format(new Date(year, month - 1, 1))}.`
      : "Nothing on file yet.";

  return (
    <section className={`rounded-2xl border border-sand-line bg-sand p-4 sm:p-5 ${className}`}>
      {/* The heading tells the office what this screen is for. */}
      <div className="mb-4">
        <h2 className="text-base font-bold text-bark">{year}</h2>
        <p className="mt-0.5 text-xs text-moss">
          Pick the month the office is answering for in {year}.
        </p>
      </div>

      <MonthPicker
        value={month !== undefined && month >= 1 && month <= 12 ? String(month) : ""}
        onChange={onChange}
        year={year}
      />

      <p className="mt-3 text-[11px] leading-relaxed text-moss-faint">{onFile}</p>
    </section>
  );
}
