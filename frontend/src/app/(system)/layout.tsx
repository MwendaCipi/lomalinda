import type { Metadata } from "next";
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
  return <SystemGate>{children}</SystemGate>;
}
