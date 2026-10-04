"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CampaignManagement } from "@/components/campaign-management";
import { TreasuryNav } from "@/components/treasury-nav";
import { usePageHeader } from "@/components/app-frame";

/**
 * Fund drives, with the goal management the treasury needs to run them.
 *
 * This is the only surface that renders the manager in admin mode — the member
 * page at /support/campaigns deliberately cannot create or issue anything.
 * A treasury account is promoted into a drive from its own row on the accounts
 * desk, where the creation form opens in place; this page is where the drive is
 * then managed. The `?new=1&account=<reference>&label=<wording>` deep link is
 * still honoured, opening the same form with that account answering for it.
 *
 * The treasury's own strip rides above it with Fund Drives marked: a drive is
 * treasury work, so the treasurer keeps the one navigation and can see where
 * they stand rather than landing here with no way back into the desk.
 */
export default function FundDrivesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setCustomToggles } = usePageHeader();

  useEffect(() => {
    setCustomToggles(
      <TreasuryNav
        active="drives"
        onSelect={(next) => {
          if (next === "givings") router.push("/administration/reconciliation?mode=all_givings");
          else if (next === "summary") router.push("/administration/reconciliation?mode=summary");
          else if (next === "accounts") router.push("/administration?tab=accounts&view=accounts");
          else if (next === "expenses") router.push("/administration?tab=accounts&view=expenditure");
          else if (next === "requests") router.push("/administration?tab=accounts&view=withdrawals");
        }}
      />
    );
    return () => setCustomToggles(null);
  }, [setCustomToggles, router]);

  return (
    <CampaignManagement
      mode="admin"
      openCreate={searchParams.get("new") === "1"}
      presetAccount={searchParams.get("account") ?? ""}
      presetAccountLabel={searchParams.get("label") ?? ""}
    />
  );
}
