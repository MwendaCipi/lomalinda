"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MoveLeft } from "lucide-react";
import { CampaignManagement } from "@/components/campaign-management";
import { TreasuryNav } from "@/components/treasury-nav";
import { usePageHeader } from "@/components/app-frame";
import { TREASURY_HEADING } from "@/config/navigation";

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
  const { setCustomToggles, setCustomHeader, setHeadingFirst, setTogglesHideOnScroll } = usePageHeader();

  useEffect(() => {
    setHeadingFirst(true);
    return () => setHeadingFirst(false);
  }, [setHeadingFirst]);

  useEffect(() => {
    setTogglesHideOnScroll(true);
    return () => setTogglesHideOnScroll(false);
  }, [setTogglesHideOnScroll]);

  useEffect(() => {
    setCustomHeader({
      label: TREASURY_HEADING.label,
      description: TREASURY_HEADING.description,
      leading: (
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.replace("/administration?tab=overview", { scroll: false });
            }
          }}
          aria-label="Back"
          className="-ml-1 inline-flex items-center justify-center rounded-xl p-1.5 text-moss transition hover:bg-sand hover:text-bark lg:hidden"
        >
          <MoveLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      ),
    });
    return () => setCustomHeader(null);
  }, [setCustomHeader, router]);

  useEffect(() => {
    setCustomToggles(
      <TreasuryNav
        active="drives"
        onSelect={(next) => {
          if (next === "givings") router.replace("/administration/treasury?mode=all_givings");
          else if (next === "summary") router.replace("/administration/treasury?mode=summary");
          else if (next === "unassigned") router.replace("/administration?tab=accounts&view=unassigned");
          else if (next === "accounts") router.replace("/administration?tab=accounts&view=accounts");
          else if (next === "expenses") router.replace("/administration?tab=accounts&view=expenditure");
          else if (next === "requests") router.replace("/administration?tab=accounts&view=withdrawals");
          else if (next === "failed") router.replace("/administration/treasury?mode=failed");
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
