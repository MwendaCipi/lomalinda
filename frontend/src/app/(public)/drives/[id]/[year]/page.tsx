import { Suspense } from "react";
import CampaignDetailClient from "@/components/campaign-detail-client";

/**
 * A fund drive's own page with year: `/drives/<id>/<year>`.
 *
 * Supports short year (e.g. `/drives/6/26`) and full year (`/drives/6/2026`).
 */
export function generateStaticParams() {
  const years = ["25", "26", "27", "2025", "2026", "2027"];
  const ids = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const params: { id: string; year: string }[] = [];
  for (const id of ids) {
    for (const year of years) {
      params.push({ id, year });
    }
  }
  return params;
}

export default function DriveYearDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-moss">Loading fund drive...</div>}>
      <CampaignDetailClient />
    </Suspense>
  );
}
