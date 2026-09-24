import { redirect } from "next/navigation";

// Fund-drive pages live behind the app shell now — the drive detail needs the
// sidebar and tab bar like every other member page. (generateStaticParams
// keeps the static export happy; the ids are a formality, the redirect runs
// client-side for whatever id arrives.)
export function generateStaticParams() {
  return ["1"].map((id) => ({ id }));
}

export default async function CampaignRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/support/campaigns/${id}`);
}
