import type { Metadata } from "next";

import { openGraphFor } from "@/config/seo";

const GIVE_DESCRIPTION =
  "Give tithes and offerings to SDA Church Loma Linda via M-Pesa paybill (4132723) or bank transfer. Support church ministries and fund drives.";

export const metadata: Metadata = {
  title: "Giving & Stewardship",
  description: GIVE_DESCRIPTION,
  alternates: {
    canonical: "/give",
  },
  openGraph: openGraphFor({
    title: "Giving & Stewardship | SDA Church Loma Linda",
    description: GIVE_DESCRIPTION,
    path: "/give",
  }),
};

export default function GiveLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
