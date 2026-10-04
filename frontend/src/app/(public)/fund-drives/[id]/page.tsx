import { Suspense } from "react";
import CampaignDetailClient from "@/components/campaign-detail-client";

/**
 * A fund drive's own page, and the link the church shares.
 *
 * The drive detail lives at `/fund-drives/<id>` now — the end point for giving
 * is the fund drive, not the old campaign wording. It sits in the *public*
 * route group so a shared link opens for someone who has never signed in (the
 * system group's layout gates on a token); a signed-in member still gets the
 * app rail around it, and the URL is the same either way. The old
 * `/campaigns/<id>` path stays as a redirect for links already in the world.
 */
export function generateStaticParams() {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((id) => ({ id }));
}

export default function FundDriveDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-moss">Loading fund drive...</div>}>
      <CampaignDetailClient />
    </Suspense>
  );
}
