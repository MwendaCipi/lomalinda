import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
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
      {/* `app-shell` is what locks outer scrolling on desktop (see globals.css) —
          only the system's own panels scroll, never the public website. The
          scroll mode (document / panel / pinned) is stamped by route inside
          AppShell; pages carry no scroll classes of their own. */}
      <AppShell>
        <SystemGate>{children}</SystemGate>
      </AppShell>
    </>
  );
}
