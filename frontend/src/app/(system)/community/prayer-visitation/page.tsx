import { redirect } from "next/navigation";

// Prayer and visitation are two desks now — the combined page is gone. The
// old links land on prayer, the more-made request; the strip there names
// visitation as the sibling.
export default function PrayerVisitationRedirect() {
  redirect("/community/prayer");
}
