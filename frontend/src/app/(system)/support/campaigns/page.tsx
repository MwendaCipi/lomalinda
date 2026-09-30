"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignManagement } from "@/components/campaign-management";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// "Fund Drives" in the rail opens the drive itself — the first active one —
// instead of a page that only lists drives. When every drive is closed (or
// the fetch fails), the member list stays as the complete record.
export default function SupportCampaignsPage() {
  const router = useRouter();
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/members/campaigns/`)
      .then((res) => (res.ok ? res.json() : []))
      .then((campaigns) => {
        const first = (Array.isArray(campaigns) ? campaigns : []).find((c) => c.is_active !== false);
        if (!cancelled && first) router.replace(`/support/campaigns/${first.id}`);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return <CampaignManagement mode="member" skipList={resolving} />;
}
