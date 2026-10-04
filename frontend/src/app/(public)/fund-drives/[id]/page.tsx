import { Suspense } from "react";
import { DriveRedirect } from "@/components/drive-redirect";

/**
 * A drive page's former address: `/fund-drives/<id>`.
 *
 * The short `/drives/<id>` is the drive's address now. This path was brief,
 * but links may already name it, so it forwards to the drive, referral and all.
 */
export function generateStaticParams() {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((id) => ({ id }));
}

export default function LegacyFundDrivesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-moss">Loading fund drive...</div>}>
      <DriveRedirect />
    </Suspense>
  );
}
