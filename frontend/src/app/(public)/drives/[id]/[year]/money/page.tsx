import { Suspense } from "react";
import CampaignDetailClient from "@/components/campaign-detail-client";

/**
 * The drive's giving modal with year: `/drives/<id>/<year>/money`.
 *
 * Supports short year (e.g. `/drives/6/26/money`) as well as full year.
 * Opens the fund drive detail and raises the giving prompt directly on arrival.
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

export default function DriveYearMoneyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-moss">Loading fund drive...</div>}>
      <CampaignDetailClient openGive />
    </Suspense>
  );
}
