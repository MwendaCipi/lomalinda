"use client";

import { redirect } from "next/navigation";

/**
 * Photos & Moments has no page of its own yet, so the path lands the member in
 * the Fellowship hub that lists it. (It used to point at the live services
 * placeholder, which is gone.)
 */
export default function MomentsRedirectPage() {
  redirect("/share");
}
