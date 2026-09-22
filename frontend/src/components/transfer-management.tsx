"use client";

import { useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Transfer = {
  id: number;
  member_name: string;
  transfer_type: "incoming" | "outgoing";
  other_church: string;
  reason?: string;
  remain_friend?: boolean | null;
  phone_number?: string;
  email?: string;
  status: "pending" | "under_review" | "approved" | "completed" | "cancelled";
  created_at: string;
};

export function TransferManagement() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [memberName, setMemberName] = useState("");
  const [transferType, setTransferType] = useState<"incoming" | "outgoing">("incoming");
  const [otherChurch, setOtherChurch] = useState("");
  const [reason, setReason] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [statusVal, setStatusVal] = useState<"pending" | "under_review" | "approved" | "completed" | "cancelled">("pending");
  const [isElder, setIsElder] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  const handleLookup = async (query?: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    let url = `${API_URL}/api/members/lookup/`;
    if (query) {
      url += `?query=${encodeURIComponent(query)}`;
    } else if (!token) {
      return;
    }
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          setMemberName((prev) => prev || data.name || "");
          setPhoneNumber((prev) => prev || data.phone_number || "");
          setEmail((prev) => prev || data.email || "");
        }
      }
    } catch {
      // Ignore lookup errors
    }
  };

  const fetchTransfers = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const res = await fetch(`${API_URL}/api/members/transfers/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setTransfers(Array.isArray(data) ? data : []);
      } else {
        setError("Failed to load membership transfers.");
      }
    } catch {
      setError("Error connecting to server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
    // Determine whether the current user is an elder/admin to show approval actions
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (token) {
      fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : null))
        .then((user) => {
          const role = (user?.role || "").toLowerCase().trim();
          setIsElder(["admin", "elder", "clerk"].includes(role) || Boolean(user?.is_staff));
        })
        .catch(() => setIsElder(false));
    }
  }, []);

  const handleReviewTransfer = async (id: number, decision: "approved" | "cancelled") => {
    const confirmText = decision === "approved"
      ? "Approve this transfer request?"
      : "Reject this transfer request?";
    if (!confirm(confirmText)) return;

    setReviewingId(id);
    try {
      const res = await fetch(`${API_URL}/api/members/transfers/${id}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(typeof window !== "undefined" ? { Authorization: `Bearer ${localStorage.getItem("access_token")}` } : {}),
        },
        body: JSON.stringify({ status: decision }),
      });
      if (res.ok) {
        showAlert(
          decision === "approved" ? "Transfer Approved" : "Transfer Rejected",
          decision === "approved"
            ? "The transfer request has been approved."
            : "The transfer request was rejected.",
          "success"
        );
        fetchTransfers();
      } else {
        const data = await res.json().catch(() => null);
        showAlert("Review Failed", data?.detail || "Could not update the transfer request.", "error");
      }
    } catch {
      showAlert("Network Error", "Could not reach the server.", "error");
    } finally {
      setReviewingId(null);
    }
  };

  const resetForm = () => {
    setMemberName("");
    setTransferType("incoming");
    setOtherChurch("");
    setReason("");
    setPhoneNumber("");
    setEmail("");
    setStatusVal("pending");
    setFormError(null);
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!memberName.trim()) {
      setFormError("Member name is required.");
      return;
    }
    if (!otherChurch.trim()) {
      setFormError("Church name is required.");
      return;
    }

    setSubmitting(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    const payload = {
      member_name: memberName.trim(),
      transfer_type: transferType,
      other_church: otherChurch.trim(),
      reason: reason.trim(),
      phone_number: phoneNumber.trim(),
      email: email.trim(),
      status: statusVal,
    };

    try {
      const res = await fetch(`${API_URL}/api/members/transfers/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showAlert("Success", "Membership transfer recorded successfully.", "success");
        resetForm();
        setIsModalOpen(false);
        fetchTransfers();
      } else {
        const errData = await res.json().catch(() => null);
        setFormError(errData?.detail || errData?.other_church?.[0] || "Failed to add membership transfer.");
      }
    } catch {
      setFormError("Network error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: number, newStatus: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      const res = await fetch(`${API_URL}/api/members/transfers/${id}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        showAlert("Updated", "Transfer status updated successfully.", "success");
        fetchTransfers();
      }
    } catch {
      showAlert("Error", "Unable to update transfer status.", "error");
    }
  };

  const getStatusStyle = (s: string) => {
    switch (s) {
      case "approved":
      case "completed":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "under_review":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "cancelled":
        return "bg-rose-100 text-rose-800 border-rose-200";
      default:
        return "bg-amber-100 text-amber-800 border-amber-200";
    }
  };

  return (
    <section className="w-full min-h-[calc(100vh-4rem)] bg-white p-6 sm:p-8 lg:p-10 border-b border-[#dfdbd1] space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dfdbd1] pb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#26352f] sm:text-3xl">
            Membership Transfers
          </h2>
          <p className="mt-1 text-sm text-[#617068]">
            Manage incoming &amp; outgoing membership transfer requests or add a manual transfer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#26352f] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1e2a25] active:scale-95"
        >
          <span>➕</span>
          <span>Add Membership Transfer</span>
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="py-12 text-center text-sm font-semibold text-[#617068]">
          Loading membership transfers...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && transfers.length === 0 && (
        <div className="rounded-3xl border border-dashed border-[#dfdbd1] bg-[#faf9f5] p-12 text-center">
          <span className="text-4xl">📋</span>
          <h3 className="mt-3 text-base font-bold text-[#26352f]">No membership transfer records</h3>
          <p className="mt-1 text-xs text-[#617068]">
            Click <span className="font-semibold text-[#26352f]">&quot;+ Add Membership Transfer&quot;</span> to manually add a member transfer.
          </p>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#26352f] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#1e2a25]"
          >
            <span>➕</span>
            <span>Add Membership Transfer</span>
          </button>
        </div>
      )}

      {/* Transfer List */}
      {!loading && !error && transfers.length > 0 && (
        <div className="space-y-4">
          {transfers.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-xs transition hover:border-[#b36b3c]"
            >
              <div className="space-y-1.5 max-w-xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-base text-[#26352f]">{t.member_name}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide border ${
                      t.transfer_type === "incoming"
                        ? "bg-purple-50 text-purple-700 border-purple-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    {t.transfer_type === "incoming" ? "Incoming Transfer" : "Outgoing Transfer"}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide border ${getStatusStyle(
                      t.status
                    )}`}
                  >
                    {(t.status || "").replace(/_/g, " ")}
                  </span>
                </div>

                <p className="text-xs font-medium text-[#617068]">
                  {t.transfer_type === "incoming" ? "Previous Church:" : "Destination Church:"}{" "}
                  <span className="font-semibold text-[#26352f]">{t.other_church}</span>
                </p>

                {(t.phone_number || t.email) && (
                  <p className="text-xs text-[#617068]">
                    Contact: {[t.phone_number, t.email].filter(Boolean).join(" • ")}
                  </p>
                )}

                {t.transfer_type === "outgoing" && t.remain_friend != null && (
                  <p className="text-xs text-[#617068]">
                    Wants to remain a friend of the church:{" "}
                    <span className={`font-bold ${t.remain_friend ? "text-[#2d5d39]" : "text-red-700"}`}>
                      {t.remain_friend ? "Yes" : "No"}
                    </span>
                  </p>
                )}

                {t.reason && (
                  <p className="text-xs italic text-[#415047] bg-[#f7f4ee] p-2.5 rounded-xl mt-1">
                    &quot;{t.reason}&quot;
                  </p>
                )}
              </div>

              {/* Elder approval actions for pending requests */}
              {isElder && (t.status === "pending" || t.status === "under_review") ? (
                <div className="flex flex-wrap items-center gap-2 self-center">
                  <button
                    type="button"
                    disabled={reviewingId === t.id}
                    onClick={() => handleReviewTransfer(t.id, "approved")}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {reviewingId === t.id ? "Processing..." : "✓ Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={reviewingId === t.id}
                    onClick={() => handleReviewTransfer(t.id, "cancelled")}
                    className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    ✕ Reject
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 self-center">
                  <label className="text-xs font-semibold text-[#617068]">Status:</label>
                  <select
                    value={t.status}
                    onChange={(e) => handleUpdateStatus(t.id, e.target.value)}
                    className="rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-1.5 text-xs font-semibold text-[#26352f] outline-none transition focus:border-[#26352f]"
                  >
                    <option value="pending">Pending</option>
                    <option value="under_review">Under Review</option>
                    <option value="approved">Approved</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Overlay for Adding Membership Transfer */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-[#dfdbd1] bg-white p-6 shadow-2xl scrollbar-thin">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-[#26352f]">Add Membership Transfer</h3>
                <p className="text-xs text-[#617068]">Record a transfer for a member who has not requested online.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-1.5 text-[#617068] transition hover:bg-[#f7f4ee] hover:text-[#26352f]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="mt-6 space-y-4">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#26352f]">
                  Member Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-[#26352f]">
                    Transfer Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={transferType}
                    onChange={(e) => setTransferType(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                  >
                    <option value="incoming">Incoming Transfer (Joining Us)</option>
                    <option value="outgoing">Outgoing Transfer (Leaving Us)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26352f]">
                    {transferType === "incoming" ? "Previous Church Name *" : "Destination Church Name *"}
                  </label>
                  <input
                    type="text"
                    required
                    value={otherChurch}
                    onChange={(e) => setOtherChurch(e.target.value)}
                    placeholder={transferType === "incoming" ? "e.g. Central SDA Church" : "e.g. New Life SDA Church"}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26352f]">Phone Number (optional)</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPhoneNumber(val);
                      const clean = val.replace(/\D/g, "");
                      if (clean.length === 10) {
                        handleLookup(clean);
                      }
                    }}
                    onBlur={() => {
                      const clean = phoneNumber.replace(/\D/g, "");
                      if (clean.length === 10) {
                        handleLookup(clean);
                      }
                    }}
                    placeholder="e.g. 0712345678"
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26352f]">Email Address (optional)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => {
                      if (email.includes("@") && email.includes(".")) {
                        handleLookup(email);
                      }
                    }}
                    placeholder="e.g. member@example.com"
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26352f]">Status</label>
                <select
                  value={statusVal}
                  onChange={(e) => setStatusVal(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                >
                  <option value="pending">Pending</option>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26352f]">Reason / Details (optional)</label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for transfer or additional background information..."
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] p-3 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-[#dfdbd1] bg-white px-4 py-2.5 text-xs font-bold text-[#26352f] transition hover:bg-[#f7f4ee]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#26352f] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1e2a25] disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save Transfer Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
