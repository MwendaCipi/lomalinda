import type { Metadata } from "next";

import { openGraphFor } from "@/config/seo";

const CALENDAR_DESCRIPTION =
  "View the SDA Church Loma Linda calendar: Sabbath School, Divine Service, Midweek vespers, and special church programmes in Meru.";

export const metadata: Metadata = {
  title: "Church Calendar & Sabbath Programmes",
  description: CALENDAR_DESCRIPTION,
  alternates: {
    canonical: "/calendar",
  },
  openGraph: openGraphFor({
    title: "Church Calendar & Sabbath Programmes | SDA Church Loma Linda",
    description: CALENDAR_DESCRIPTION,
    path: "/calendar",
  }),
};

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
