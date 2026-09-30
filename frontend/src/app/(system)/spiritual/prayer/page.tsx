import { redirect } from "next/navigation";

// Prayer has its own desk now — see /community/prayer.
export default function SpiritualPrayerPage() {
  redirect("/community/prayer");
}
