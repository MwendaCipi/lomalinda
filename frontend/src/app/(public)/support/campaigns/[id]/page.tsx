import { Suspense } from "react";
import { DriveRedirect } from "@/components/drive-redirect";

/**
 * The drive page's old in-app address: `/support/campaigns/<id>`.
 *
 * The drive is `/fund-drives/<id>` now. This path stays so older links keep
 * working, and forwards to the new address with any `?ref=` intact.
 */
export function generateStaticParams() {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((id) => ({ id }));
}

export default function LegacySupportCampaignPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-moss">Loading fund drive...</div>}>
      <DriveRedirect />
    </Suspense>
  );
}
