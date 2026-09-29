import { redirect } from "next/navigation";

/**
 * Periodic Reports is one of the two views of Reports now, so this URL keeps
 * working for anyone with it bookmarked or saved to a home screen: it opens
 * the merged page with the statements already selected.
 */
export default function PeriodicReportsRedirect() {
  redirect("/support/reports?view=periodic");
}
