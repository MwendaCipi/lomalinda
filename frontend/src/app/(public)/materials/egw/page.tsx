import { redirect } from "next/navigation";
import { fellowshipResources } from "@/config/fellowship-resources";

export default function EgwPage() {
  redirect(fellowshipResources.egw);
}
