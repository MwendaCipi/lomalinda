"use client";

/**
 * The treasury's views, as one line of toggles.
 *
 * The ledger (reconciliation), the accounts desk and the drives page all show
 * this same strip — Individual Givings, Summary Contributions, Church
 * Accounts, Fund Drives, Expenses and Requests — so the treasurer meets one
 * navigation wherever in the treasury they stand. Each page renders it into
 * the shell's header band
 * (`usePageHeader().setCustomToggles`), which is what keeps it a single line:
 * the band shows either this strip or the section's own pages, never both.
 *
 * The strip is purely presentational. Which view is active, and what a press
 * does (swap the page in place, or walk to the sibling page that owns the
 * view), is the page's to decide — the two desks read the same names but
 * answer them with different state.
 */
export type TreasuryView = "givings" | "summary" | "accounts" | "drives" | "expenses" | "requests";

const TREASURY_VIEWS: { key: TreasuryView; label: string }[] = [
  { key: "givings", label: "Individual Givings" },
  { key: "summary", label: "Summary Contributions" },
  { key: "accounts", label: "Church Accounts" },
  // A fund drive is born from one of those accounts, so it stands beside
  // them: the treasurer reaches the drives without leaving the treasury.
  { key: "drives", label: "Fund Drives" },
  { key: "expenses", label: "Expenses" },
  { key: "requests", label: "Requests" },
];

export function TreasuryNav({
  active,
  onSelect,
}: {
  /** Which of the treasury's views the page is showing. */
  active: TreasuryView;
  onSelect: (view: TreasuryView) => void;
}) {
  // The same underline tabs the rest of the app uses — a label over the band's
  // rule rather than a pill button.
  const tabClass = (isActive: boolean) =>
    `relative flex h-11 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 text-sm font-semibold transition ${
      isActive ? "border-bark text-bark" : "border-transparent text-moss hover:border-ember hover:text-bark"
    }`;

  return (
    <div role="group" aria-label="Treasury views" className="flex flex-wrap items-center gap-1">
      {TREASURY_VIEWS.map((view) => (
        <button
          key={view.key}
          type="button"
          onClick={() => onSelect(view.key)}
          aria-pressed={active === view.key}
          className={tabClass(active === view.key)}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}
