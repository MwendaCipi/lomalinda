import { Suspense } from "react";
import CampaignDetailClient from "@/components/campaign-detail-client";

/**
 * A fund drive's own page, and the link the church shares: `/drives/<id>`.
 *
 * The short address names the drive plainly — the end point for giving is the
 * fund drive. It sits in the *public* route group so a shared link opens for
 * someone who has never signed in (the system group's layout gates on a
 * token); a signed-in member still gets the app rail around it, and the URL is
 * the same either way. The older `/fund-drives/<id>`, `/campaigns/<id>` and
 * `/support/campaigns/<id>` paths forward here for links already in the world.
 */
export function generateStaticParams() {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((id) => ({ id }));
}

export default function DriveDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-moss">Loading fund drive...</div>}>
      <CampaignDetailClient />
    </Suspense>
  );
}
