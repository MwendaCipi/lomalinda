import { redirect } from "next/navigation";

/**
 * Periodic Reports is the published statements — the Reports page itself now,
 * after Live Balances took its own route back. This URL keeps working for
 * anyone with it bookmarked or saved to a home screen.
 */
export default function PeriodicReportsRedirect() {
  redirect("/support/reports");
}
