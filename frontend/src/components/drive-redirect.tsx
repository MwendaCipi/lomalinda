"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

/**
 * Old drive links forward to the drive's own address.
 *
 * A drive page has lived at `/campaigns/<id>`, `/support/campaigns/<id>` and
 * `/fund-drives/<id>`; it is `/drives/<id>` now (and its giving modal at
 * `/drives/<id>/money`). Links already shared in the world still land here, so
 * each old path quietly moves on to the new one, carrying a `?ref=` referral
 * along so an invite that predates the change still credits its member.
 */
export function DriveRedirect({ suffix = "" }: { suffix?: string }) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id;

  useEffect(() => {
    if (!id) return;
    const ref = searchParams?.get("ref");
    const path = `/drives/${id}${suffix ? `/${suffix}` : ""}`;
    router.replace(`${path}${ref ? `?ref=${ref}` : ""}`);
  }, [id, router, searchParams, suffix]);

  return <div className="p-8 text-center text-sm text-moss">Opening the fund drive...</div>;
}
