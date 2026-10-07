/**
 * OfflineBanner — shown when a page is reading from the SW offline cache.
 *
 * Usage:
 *   <OfflineBanner isOffline={isOffline} cachedAt={cachedAt} />
 *
 * When `isOffline` is false the component renders nothing.
 * The banner is non-intrusive: a single slim strip at the top of the content
 * area (not fixed to the viewport) so it does not obscure controls.
 */
"use client";

import { WifiOff } from "lucide-react";
import { formatCachedAt } from "@/lib/offline-fetch";

export function OfflineBanner({
  isOffline,
  cachedAt,
  className = "",
}: {
  isOffline: boolean;
  cachedAt: Date | null;
  className?: string;
}) {
  if (!isOffline) return null;
  const ago = formatCachedAt(cachedAt);
  return (
    <div
      className={`flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200 ${className}`}
      role="status"
      aria-live="polite"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>
        You&apos;re offline — showing{ago ? ` data last synced ${ago}` : " cached data"}.
        Some information may be out of date.
      </span>
    </div>
  );
}
