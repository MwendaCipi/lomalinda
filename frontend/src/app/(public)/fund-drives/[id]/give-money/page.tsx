import { Suspense } from "react";
import CampaignDetailClient from "@/components/campaign-detail-client";

/**
 * The drive's giving modal, opened directly: `/fund-drives/<id>/give-money`.
 *
 * A link the office can share — in a WhatsApp group, on a poster — that lands
 * a giver straight in the M-Pesa prompt for one drive, with the drive's page
 * still behind it. It renders the same detail page, told to open its giving
 * modal on arrival.
 */
export function generateStaticParams() {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((id) => ({ id }));
}

export default function FundDriveGiveMoneyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-moss">Loading fund drive...</div>}>
      <CampaignDetailClient openGive />
    </Suspense>
  );
}
