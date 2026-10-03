import { Suspense } from "react";
import CampaignDetailClient from "@/components/campaign-detail-client";

/**
 * The public home of a fund drive, and the link the church shares.
 *
 * This is the same drive page the app shows at `/support/campaigns/<id>`; the
 * component is imported directly rather than redirected to, so a shared link
 * opens for someone who has never signed in. (A redirect to the app path used
 * to strand visitors on the sign-in screen, because that path's layout gates
 * on a token — the page now lives in the public route group instead.)
 */
export function generateStaticParams() {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((id) => ({ id }));
}

export default function PublicCampaignPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-moss">Loading fund drive...</div>}>
      <CampaignDetailClient />
    </Suspense>
  );
}
