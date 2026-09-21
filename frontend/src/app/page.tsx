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
 * A static shell renders on the server; the browser swaps in the right view
 * after checking the session, so no member data is ever embedded in the HTML.
 */
export default function Home() {
  const pathname = usePathname();
  const [status, setStatus] = useState<"loading" | "visitor" | "member">("loading");

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

  if (status === "loading") {
    return (
      <main className="flex min-h-[70vh] items-center justify-center text-sm text-[#617068]">
        Loading…
      </main>
    );
  }

  return status === "member" ? <MemberHome /> : <MarketingHome />;
}
