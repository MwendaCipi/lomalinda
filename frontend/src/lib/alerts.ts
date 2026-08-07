import Swal from "sweetalert2";

export function showAlert(title: string, text: string, icon: "success" | "error" | "warning" | "info" = "info") {
  return Swal.fire({
    title,
    text,
    icon,
    confirmButtonText: "OK",
  });
}
