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
