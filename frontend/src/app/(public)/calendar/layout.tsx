import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Church Calendar & Sabbath Programmes",
  description:
    "View the SDA Loma Linda church calendar: Sabbath School, Divine Service, Midweek vespers, and special church programmes in Meru.",
  alternates: {
    canonical: "/calendar",
  },
  openGraph: {
    title: "Church Calendar & Sabbath Programmes | SDA Loma Linda",
    description:
      "View the SDA Loma Linda church calendar: Sabbath School, Divine Service, Midweek vespers, and special church programmes in Meru.",
    url: "https://sdalomalinda.or.ke/calendar",
  },
};

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
