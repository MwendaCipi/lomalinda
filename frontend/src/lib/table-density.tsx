"use client";

import { useCallback, useEffect, useState } from "react";
import { Rows3 } from "lucide-react";

/**
 * Row density, remembered per device, shared by every desk table.
 *
 * An officer scanning long lists wants as many rows on the screen as will
 * fit; the same officer reading one record wants the room. Compact halves
 * the cell padding and (where a table shows a second line) drops it, which
 * is where most of a row's height actually goes. One setting covers the
 * whole desk so the choice made on the roster carries to the other tables.
 */

const DENSITY_KEY = "roster_density";

/** True when storage says compact. Storage is a nicety — never throw. */
function storedDensity(): boolean {
  try {
    return localStorage.getItem(DENSITY_KEY) === "compact";
  } catch {
    return false;
  }
}

/** Read once on mount, then written on every flip. */
export function useTableDensity(): {
  dense: boolean;
  toggleDensity: () => void;
} {
  const [dense, setDense] = useState(false);
  useEffect(() => {
    setDense(storedDensity());
  }, []);

  const toggleDensity = useCallback(() => {
    setDense((current) => {
      const next = !current;
      try {
        localStorage.setItem(DENSITY_KEY, next ? "compact" : "comfortable");
      } catch {
        // Remembering it is a nicety; the view still switches.
      }
      return next;
    });
  }, []);

  return { dense, toggleDensity };
}

/** Cell padding for the current density — the roster's old cellPad. */
export function densityCellPad(dense: boolean): string {
  return dense ? "py-1.5" : "py-3";
}

/**
 * The toggle, rendered the same way on every table: beside whatever count
 * the table shows, compacting to the icon alone on phones. The button is
 * dark while compact, so the pressed state reads like the other controls.
 */
export function DensityToggle({
  dense,
  onToggle,
  className = "",
}: {
  dense: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={dense}
      aria-label={dense ? "Use comfortable rows" : "Use compact rows"}
      title={dense ? "Back to the roomier rows" : "Fit more rows on the screen"}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition ${
        dense
          ? "border-[#26352f] bg-[#26352f] text-white"
          : "border-[#dfdbd1] bg-[#f7f4ee] text-[#617068] hover:border-[#b36b3c] hover:text-[#b36b3c]"
      } ${className}`}
    >
      <Rows3 className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Compact</span>
    </button>
  );
}
