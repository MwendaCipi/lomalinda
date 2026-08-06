import MinistryDetailClient from "./ministry-detail-client";

export function generateStaticParams() {
  return [
    "adventist-youth",
    "possibility-ministries",
    "adventist-men",
    "adventist-women",
    "personal-ministries",
    "adventist-muslim-relations",
    "ensemble",
    "chaplaincy",
  ].map((slug) => ({ slug }));
}

export default function MinistryDetailPage() {
  return <MinistryDetailClient />;
}
