import { Suspense } from "react";
import CampaignDetailClient from "./campaign-detail-client";

export function generateStaticParams() {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((id) => ({ id }));
}

export default function CampaignDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[#617068]">Loading campaign...</div>}>
      <CampaignDetailClient />
    </Suspense>
  );
}
