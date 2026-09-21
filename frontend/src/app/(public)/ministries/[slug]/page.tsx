import MinistryDetailClient from "./ministry-detail-client";
import { MINISTRIES } from "@/config/ministries";

export function generateStaticParams() {
  return MINISTRIES.map((ministry) => ({ slug: ministry.slug }));
}

export default function MinistryDetailPage() {
  return <MinistryDetailClient />;
}
