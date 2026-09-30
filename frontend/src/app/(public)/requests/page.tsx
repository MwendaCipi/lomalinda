"use client";

import { redirect } from "next/navigation";

/**
 * The old Requests hub is gone: the row opens on the prayer & visitation form
 * itself — the most-made request — and the strip on that page names the other
 * ways to ask. Links already in the world land there instead of on a page of
 * cards that only led to another page.
 */
export default function RequestsRedirectPage() {
  redirect("/community/prayer-visitation");
}
