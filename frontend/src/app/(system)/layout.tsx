import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SystemGate } from "@/components/system-gate";

// Sections behind the sign-in wall are not for search engines. `robots` is
// prerendered into the static HTML of every page in this group.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* System chrome: full header with account menu plus the mobile bottom
          tab bar. The bottom padding keeps content clear of that tab bar. */}
      <SiteHeader />
      <div className="flex-1 min-h-0 flex flex-col pb-24 md:pb-0">
        <SystemGate>{children}</SystemGate>
      </div>
    </>
  );
}
