import MinistryDetailClient from "./ministry-detail-client";

export function generateStaticParams() {
  return [
    "adventist-youth",
    "possibility-ministries",
    "adventist-men",
    "adventist-women",
    "ensemble",
    "chaplaincy",
    "evangelism",
  ].map((slug) => ({ slug }));
}

export default function MinistryDetailPage() {
  return <MinistryDetailClient />;
}
