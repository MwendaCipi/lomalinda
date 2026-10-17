import Swal, { SweetAlertIcon, SweetAlertOptions } from "sweetalert2";
import { brand } from "@/lib/brand";

export function showAlert(
  title: string,
  text: string,
  icon: SweetAlertIcon = "info",
  options?: SweetAlertOptions
) {
  return Swal.fire({
    title,
    text,
    icon,
    confirmButtonText: "OK",
    confirmButtonColor: brand.bark,
    ...options,
  });
}

/**
 * The thank-you a giver sees once their gift is on the book.
 *
 * Every desk that records a gift — money at the bank, an M-Pesa PIN that has
 * landed, goods handed over — thanks the giver in one voice: the gift is
 * named where the API said what it was, the church says plainly that it is
 * grateful, and the emoji carries the congratulations a receipt cannot. The
 * caller passes the API's own sentence when it has one, so a message written
 * by the ledger is not replaced here by a second one that says the same.
 */
export function showGivingThanks(
  options: { kind?: "money" | "in-kind"; detail?: string; title?: string } = {}
) {
  const { kind = "money", detail, title = "Thank you! 🎉" } = options;
  const fallback =
    kind === "in-kind"
      ? "Your in-kind giving has been recorded. The church is grateful for your generosity."
      : "Your gift has been recorded. The church is grateful for your generosity.";
  const text = (detail ?? "").trim() || fallback;
  return Swal.fire({
    title,
    text,
    icon: "success",
    confirmButtonText: "Close",
    confirmButtonColor: brand.bark,
  });
}
