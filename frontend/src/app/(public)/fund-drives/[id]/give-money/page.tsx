import { Suspense } from "react";
import { DriveRedirect } from "@/components/drive-redirect";

/**
 * A drive's former giving-modal address: `/fund-drives/<id>/give-money`.
 *
 * It is `/drives/<id>/money` now; this path forwards there, referral intact.
 */
export function generateStaticParams() {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((id) => ({ id }));
}

export default function LegacyFundDrivesGiveMoneyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-moss">Loading fund drive...</div>}>
      <DriveRedirect suffix="money" />
    </Suspense>
  );
}
