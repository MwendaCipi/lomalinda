import { Suspense } from "react";
import CampaignDetailClient from "@/components/campaign-detail-client";

// The drive detail is fully client-driven (it fetches by id at runtime), so the
// exported ids are a formality to satisfy `output: export`.
//
// It lives under the *public* route group, not the system one, because a drive
// is shared as a link and must open for someone who has never signed in: the
// system group's layout wraps every page in SystemGate, which bounces a visitor
// to /login. Here a visitor gets the website header and the page itself; a
// signed-in member still gets the app rail around it (AppFrame decides that),
// and the URL is the same either way.
export function generateStaticParams() {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((id) => ({ id }));
}

export default function CampaignDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-moss">Loading campaign...</div>}>
      <CampaignDetailClient />
    </Suspense>
  );
}
