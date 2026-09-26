"use client";

import { useSearchParams } from "next/navigation";
import { CampaignManagement } from "@/components/campaign-management";

/**
 * Fund drives, with the goal management the treasury needs to run them.
 *
 * This is the only surface that renders the manager in admin mode — the member
 * page at /support/campaigns deliberately cannot create or issue anything.
 * A treasury account is promoted into a drive from its own row, which lands
 * here with `?new=1&account=<reference>&label=<wording>`: the creation form
 * opens straight away with that account already answering for the drive.
 */
export default function FundDrivesPage() {
  const searchParams = useSearchParams();

  return (
    <CampaignManagement
      mode="admin"
      openCreate={searchParams.get("new") === "1"}
      presetAccount={searchParams.get("account") ?? ""}
      presetAccountLabel={searchParams.get("label") ?? ""}
    />
  );
}
