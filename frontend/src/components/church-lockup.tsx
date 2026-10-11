/**
 * The church's letterhead — the SDA symbol beside the church's own name —
 * shown on printed documents only (the browser's print dialog, never the
 * screen). The symbol is the official mark recoloured to its brown for
 * white paper; the name is this church's, not the denomination's.
 */
export function ChurchLockup({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a tiny local
          SVG shown only in the browser's print dialog; next/image optimizes
          nothing here and would complicate the print-only render. */}
      <img src="/adventist-symbol-print.svg" alt="" className="h-10 w-auto" />
      <p className="text-sm font-bold leading-tight" style={{ color: "#5E3929" }}>
        SDA Church
        <br />
        Loma Linda, Meru
      </p>
    </div>
  );
}
