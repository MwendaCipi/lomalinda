"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

/**
 * Old drive links forward to the drive's own address.
 *
 * A drive page used to live at `/campaigns/<id>` and `/support/campaigns/<id>`;
 * it is `/fund-drives/<id>` now. Links already shared in the world still land
 * here, so both old paths quietly move on to the new one, carrying a `?ref=`
 * referral along so an invite that predates the change still credits its
 * member.
 */
export function DriveRedirect() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id;

  useEffect(() => {
    if (!id) return;
    const ref = searchParams?.get("ref");
    router.replace(`/fund-drives/${id}${ref ? `?ref=${ref}` : ""}`);
  }, [id, router, searchParams]);

  return <div className="p-8 text-center text-sm text-moss">Opening the fund drive...</div>;
}
