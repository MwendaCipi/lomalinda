/**
 * The vocabulary the church's requests share.
 *
 * Six kinds of request arrive from six different pages — a join, a prayer, a
 * visitation, a child dedication, a welfare note, a membership transfer — and
 * each one carries its own statuses. This is the single place that decides what
 * those statuses mean to the person answering them, so the requests desk's
 * filters, the sidebar's badge and the dashboard's pulse can never disagree
 * about what "waiting" is.
 *
 * The backend counts the same way (see the waiting-status sets in the pulse
 * view), so the two ends of the app answer this question identically.
 */

/** The review state a request falls in: still to answer, answered, or closed. */
export type ReviewBucket = "pending" | "approved" | "rejected";

/** The desk's filter choices: one bucket, or everything. */
export type StatusFilter = "all" | ReviewBucket;

/**
 * Which review-state bucket a row belongs in — the one place that maps every
 * desk's own statuses onto the filter's choices, so a new desk or a renamed
 * status only has to be added here:
 *
 *   pending  — waiting on the office (a join nobody has approved, an "under
 *              review" transfer, a prayer request saying "new", and a welfare
 *              submission, which has no status at all because every one of
 *              them is still somebody's to pick up)
 *   approved — answered yes / done (approved, completed, prayed)
 *   rejected — answered no or lapsed (rejected, cancelled, closed, expired)
 *
 * An unknown status is shown among the unanswered rather than dropped.
 */
export function reviewBucket(row: { status?: string | null }): ReviewBucket {
  const status = row.status ?? "";
  if (status === "pending" || status === "verification_pending" || status === "under_review" || status === "received" || status === "new" || status === "") {
    return "pending";
  }
  if (status === "approved" || status === "completed" || status === "prayed") {
    return "approved";
  }
  if (status === "rejected" || status === "cancelled" || status === "closed" || status === "expired") {
    return "rejected";
  }
  return "pending";
}

/** Whether a request is still somebody's to answer. */
export function isWaiting(row: { status?: string | null }): boolean {
  return reviewBucket(row) === "pending";
}
