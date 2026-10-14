import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Giving & Stewardship",
  description:
    "Give tithes and offerings to SDA Loma Linda via M-Pesa paybill (4132723) or bank transfer. Support church ministries and fund drives.",
  alternates: {
    canonical: "/give",
  },
  openGraph: {
    title: "Giving & Stewardship | SDA Loma Linda",
    description:
      "Give tithes and offerings to SDA Loma Linda via M-Pesa paybill (4132723) or bank transfer. Support church ministries and fund drives.",
    url: "https://sdalomalinda.or.ke/give",
  },
};

export default function GiveLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
