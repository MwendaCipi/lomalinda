"use client";

import { useSearchParams } from "next/navigation";
import { CampaignManagement } from "@/components/campaign-management";

/**
 * Fund drives, with the goal management the treasury needs to run them.
 *
 * This is the only surface that renders the manager in admin mode — the member
 * page at /support/campaigns deliberately cannot create or issue anything.
 * Treasury Accounts links here with `?new=1`, which opens the creation form
 * straight away so "Add Fund Drive" really does add one.
 */
export default function FundDrivesPage() {
  const searchParams = useSearchParams();

  return <CampaignManagement mode="admin" openCreate={searchParams.get("new") === "1"} />;
}
