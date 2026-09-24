import { redirect } from "next/navigation";

// Prayer and visitation are one desk now — see /community/prayer-visitation.
export default function SpiritualPrayerPage() {
  redirect("/community/prayer-visitation");
}
