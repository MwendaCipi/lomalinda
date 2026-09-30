import { redirect } from "next/navigation";

// The combined Reports page is split: the live balances live at
// /support/financial, the published statements stay at /support/reports.
export default function LegacyFinancialPage() {
  redirect("/support/financial");
}
