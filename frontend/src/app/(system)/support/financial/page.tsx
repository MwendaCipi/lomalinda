import { redirect } from "next/navigation";

// Giving is a public, shareable page — send /support/financial visitors there.
export default function FinancialGivingPage() {
  redirect("/give/");
}
