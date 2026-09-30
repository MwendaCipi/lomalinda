import { redirect } from "next/navigation";

// Visitation has its own desk now — see /community/visitation.
export default function SpiritualVisitationPage() {
  redirect("/community/visitation");
}
