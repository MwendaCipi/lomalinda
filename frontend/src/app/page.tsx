"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MarketingHome } from "@/components/marketing-home";
import { MemberHome } from "@/components/member-home";

/**
 * The root route serves both audiences:
 * - visitors see the public marketing site (indexable, shareable)
 * - signed-in members land on their system dashboard
 *
 * The marketing page is prerendered into the static HTML so visitors — and
 * crawlers — always get the real site with its sign-in link, even before the
 * JavaScript bundle loads. The session probe then swaps in the member
 * dashboard for signed-in users, so no member data is ever embedded in HTML.
 */
export default function Home() {
  const pathname = usePathname();
  const [status, setStatus] = useState<"visitor" | "member">("visitor");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setStatus("visitor");
      return;
    }
    // Cheap validity probe — avoids showing stale dashboards for expired tokens.
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/members/me/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => setStatus(res.ok ? "member" : "visitor"))
      .catch(() => setStatus("visitor"));
  }, [pathname]);

  return status === "member" ? <MemberHome /> : <MarketingHome />;
}
