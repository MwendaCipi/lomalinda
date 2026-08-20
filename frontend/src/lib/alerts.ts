import Swal, { SweetAlertIcon, SweetAlertOptions } from "sweetalert2";

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
    confirmButtonColor: "#26352f",
    ...options,
  });
}
