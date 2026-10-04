import { Suspense } from "react";
import { DriveRedirect } from "@/components/drive-redirect";

/**
 * The drive page's old public address: `/campaigns/<id>`.
 *
 * A fund drive is `/drives/<id>` now — the end point for giving names the
 * drive, not the old campaign wording. This path is kept so links already in
 * the world still open; it forwards to the new address, referral token and all.
 */
export function generateStaticParams() {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((id) => ({ id }));
}

export default function LegacyCampaignPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-moss">Loading fund drive...</div>}>
      <DriveRedirect />
    </Suspense>
  );
}
