import { redirect } from "next/navigation";

// Prayer and visitation are one desk now: the merged page holds both forms
// and both ledgers behind one filter.
export default function CommunityPrayerPage() {
  redirect("/community/prayer-visitation");
}
