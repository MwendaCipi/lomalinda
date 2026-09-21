"use client";

import { useEffect, useState } from "react";

import { showAlert } from "@/lib/alerts";
import { TransferManagement } from "./transfer-management";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type PrayerItem = {
  id: number;
  name?: string;
  email?: string;
  phone_number?: string;
  anonymous?: boolean;
  request_text: string;
  created_at: string;
};

type VisitationItem = {
  id: number;
  name: string;
  phone_number?: string;
  address?: string;
  reason?: string;
  preferred_date?: string;
  notes?: string;
  status?: string;
  created_at?: string;
};

type ChildDedicationItem = {
  id: number;
  child_name: string;
  child_dob?: string;
  father_name?: string;
  mother_name?: string;
  phone_number?: string;
  notes?: string;
  status?: string;
  created_at?: string;
};

type SupportItem = {
  id: number;
  submission_type?: string;
  category?: string;
  content: string;
  name?: string;
  phone_number?: string;
  email?: string;
  anonymous?: boolean;
  created_at?: string;
};

type RemovalItem = {
  id: number;
  member: number;
  member_name: string;
  member_email?: string;
  reason: "disciplinary" | "death" | "transfer_out";
  notes?: string;
  status: "pending" | "approved" | "rejected";
  requested_by_name?: string;
  created_at: string;
  reviewed_at?: string | null;
};

type ActiveTab = "prayer" | "visitation" | "dedication" | "welfare" | "removals" | "transfers";

interface RequestsAdminManagerProps {
  initialTab?: ActiveTab;
}

export function RequestsAdminManager({ initialTab = "prayer" }: RequestsAdminManagerProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [prayerRequests, setPrayerRequests] = useState<PrayerItem[]>([]);
  const [visitationRequests, setVisitationRequests] = useState<VisitationItem[]>([]);
  const [childDedications, setChildDedications] = useState<ChildDedicationItem[]>([]);
  const [supportSubmissions, setSupportSubmissions] = useState<SupportItem[]>([]);
  const [removalRequests, setRemovalRequests] = useState<RemovalItem[]>([]);
  const [isElder, setIsElder] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const authHeaders = (): Record<string, string> => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchAll = async () => {
    setLoading(true);
    const headers = authHeaders();
    try {
      const [pRes, vRes, dRes, sRes, rRes] = await Promise.all([
        fetch(`${API_URL}/api/members/prayer-requests/`, { headers }),
        fetch(`${API_URL}/api/members/visitations/`, { headers }),
        fetch(`${API_URL}/api/members/child-dedications/`, { headers }),
        fetch(`${API_URL}/api/members/support-submissions/`, { headers }),
        fetch(`${API_URL}/api/members/removal-requests/`, { headers }),
      ]);
      setPrayerRequests(pRes.ok ? await pRes.json() : []);
      setVisitationRequests(vRes.ok ? await vRes.json() : []);
      setChildDedications(dRes.ok ? await dRes.json() : []);
      setSupportSubmissions(sRes.ok ? await sRes.json() : []);
      setRemovalRequests(rRes.ok ? await rRes.json() : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // Determine whether the current user is an elder/admin to show review actions
    const token = getToken();
    if (token) {
      fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : null))
        .then((user) => {
          const role = (user?.role || "").toLowerCase().trim();
          setIsElder(["admin", "elder", "leader"].includes(role) || Boolean(user?.is_staff));
        })
        .catch(() => setIsElder(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReviewRemoval = async (id: number, decision: "approved" | "rejected") => {
    const confirmText = decision === "approved"
      ? "Approve this removal? The member will lose member access."
      : "Reject this removal request?";
    if (!confirm(confirmText)) return;

    setReviewingId(id);
    try {
      const res = await fetch(`${API_URL}/api/members/removal-requests/${id}/`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: decision }),
      });
      if (res.ok) {
        showAlert(
          decision === "approved" ? "Removal Approved" : "Removal Rejected",
          decision === "approved"
            ? "The membership removal has been approved and applied."
            : "The removal request was rejected.",
          "success"
        );
        fetchAll();
      } else {
        const data = await res.json().catch(() => null);
        showAlert("Review Failed", data?.detail || "Could not update the removal request.", "error");
      }
    } catch {
      showAlert("Network Error", "Could not reach the server.", "error");
    } finally {
      setReviewingId(null);
    }
  };

  const tabs: { key: ActiveTab; label: string; count?: number }[] = [
    { key: "prayer", label: "Prayer Requests", count: prayerRequests.length },
    { key: "visitation", label: "Visitation", count: visitationRequests.length },
    { key: "dedication", label: "Child Dedications", count: childDedications.length },
    { key: "welfare", label: "Welfare & Support", count: supportSubmissions.length },
    { key: "removals", label: "Removal Requests", count: removalRequests.filter((r) => r.status === "pending").length },
    { key: "transfers", label: "Membership Transfers" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#26352f]">Pastoral & Member Requests</h2>
          <p className="mt-0.5 text-sm text-[#617068]">
            Review and manage prayer, visitation, dedications, welfare, and membership transfer requests.
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="shrink-0 rounded-full border border-[#c9c5bb] px-4 py-2 text-xs font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              activeTab === tab.key
                ? "bg-[#26352f] text-white"
                : "bg-[#f7f4ee] text-[#26352f] hover:bg-[#ede8dc]"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  activeTab === tab.key ? "bg-white text-[#26352f]" : "bg-[#dfdbd1] text-[#617068]"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="rounded-2xl border border-[#dfdbd1] bg-white p-8 text-center text-sm text-[#617068]">
          Loading requests...
        </div>
      )}

      {/* Prayer Requests */}
      {!loading && activeTab === "prayer" && (
        <div className="space-y-4">
          {prayerRequests.length === 0 ? (
            <EmptyState icon="🙏" label="No prayer requests submitted yet." />
          ) : (
            prayerRequests.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-5 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-[#26352f]">
                      {item.anonymous ? "Anonymous" : item.name || "Church Member"}
                    </p>
                    {!item.anonymous && (item.email || item.phone_number) && (
                      <p className="text-xs text-[#617068]">
                        {[item.email, item.phone_number].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-[#617068]">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
                <p className="text-sm leading-6 text-[#3d5148] bg-[#f7f4ee] rounded-xl px-4 py-3">
                  {item.request_text}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Visitation Requests */}
      {!loading && activeTab === "visitation" && (
        <div className="space-y-4">
          {visitationRequests.length === 0 ? (
            <EmptyState icon="🏠" label="No visitation requests submitted yet." />
          ) : (
            visitationRequests.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-5 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-[#26352f]">{item.name}</p>
                    {item.phone_number && (
                      <p className="text-xs text-[#617068]">{item.phone_number}</p>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    {item.status && (
                      <span className="inline-block rounded-full bg-[#eef2ed] px-2.5 py-0.5 text-[10px] font-bold capitalize text-[#5f8067]">
                        {item.status}
                      </span>
                    )}
                    {item.created_at && (
                      <p className="text-xs text-[#617068]">
                        {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 text-xs text-[#617068]">
                  {item.address && <Field label="Address" value={item.address} />}
                  {item.preferred_date && <Field label="Preferred Date" value={item.preferred_date} />}
                  {item.reason && <Field label="Reason" value={item.reason} />}
                  {item.notes && <Field label="Notes" value={item.notes} />}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Child Dedications */}
      {!loading && activeTab === "dedication" && (
        <div className="space-y-4">
          {childDedications.length === 0 ? (
            <EmptyState icon="👶" label="No child dedication requests submitted yet." />
          ) : (
            childDedications.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-5 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-[#26352f]">{item.child_name}</p>
                    {item.child_dob && (
                      <p className="text-xs text-[#617068]">DOB: {item.child_dob}</p>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    {item.status && (
                      <span className="inline-block rounded-full bg-[#eef2ed] px-2.5 py-0.5 text-[10px] font-bold capitalize text-[#5f8067]">
                        {item.status}
                      </span>
                    )}
                    {item.created_at && (
                      <p className="text-xs text-[#617068]">
                        {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 text-xs text-[#617068]">
                  {item.father_name && <Field label="Father" value={item.father_name} />}
                  {item.mother_name && <Field label="Mother" value={item.mother_name} />}
                  {item.phone_number && <Field label="Phone" value={item.phone_number} />}
                  {item.notes && <Field label="Notes" value={item.notes} />}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Welfare & Support Submissions */}
      {!loading && activeTab === "welfare" && (
        <div className="space-y-4">
          {supportSubmissions.length === 0 ? (
            <EmptyState icon="🤝" label="No welfare or support submissions yet." />
          ) : (
            supportSubmissions.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-5 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-[#26352f]">
                      {item.anonymous ? "Anonymous" : item.name || "Church Member"}
                    </p>
                    {!item.anonymous && (item.email || item.phone_number) && (
                      <p className="text-xs text-[#617068]">
                        {[item.email, item.phone_number].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    {item.submission_type && (
                      <span className="inline-block rounded-full bg-[#f7f0e8] px-2.5 py-0.5 text-[10px] font-bold capitalize text-[#b36b3c]">
                        {item.submission_type.replace(/_/g, " ")}
                      </span>
                    )}
                    {item.created_at && (
                      <p className="text-xs text-[#617068]">
                        {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                {item.category && (
                  <p className="text-xs text-[#617068]">Category: <span className="font-medium">{item.category}</span></p>
                )}
                <p className="text-sm leading-6 text-[#3d5148] bg-[#f7f4ee] rounded-xl px-4 py-3">
                  {item.content}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Removal Requests Sub-tab */}
      {!loading && activeTab === "removals" && (
        <div className="space-y-4">
          {removalRequests.length === 0 ? (
            <EmptyState icon="🚫" label="No membership removal requests yet." />
          ) : (
            removalRequests.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-5 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-[#26352f]">{item.member_name}</p>
                    {item.member_email && <p className="text-xs text-[#617068]">{item.member_email}</p>}
                    <p className="text-xs text-[#617068]">
                      Requested by {item.requested_by_name || "church official"}
                      {item.created_at ? ` · ${new Date(item.created_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        item.reason === "death"
                          ? "bg-slate-100 text-slate-700"
                          : item.reason === "transfer_out"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-700"
                      }`}
                    >
                      {item.reason.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        item.status === "approved"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.status === "rejected"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {item.status === "pending" ? "Pending elder approval" : item.status}
                    </span>
                  </div>
                </div>
                {item.notes && (
                  <p className="text-xs italic text-[#415047] bg-[#f7f4ee] p-2.5 rounded-xl">&quot;{item.notes}&quot;</p>
                )}
                {isElder && item.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={reviewingId === item.id}
                      onClick={() => handleReviewRemoval(item.id, "approved")}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {reviewingId === item.id ? "Processing..." : "✓ Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === item.id}
                      onClick={() => handleReviewRemoval(item.id, "rejected")}
                      className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      ✕ Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Membership Transfers Sub-tab */}
      {activeTab === "transfers" && (
        <div>
          <TransferManagement />
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-[#c9c5bb] bg-white p-8 sm:p-12 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="mt-3 text-sm text-[#617068]">{label}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold text-[#26352f]">{label}: </span>
      {value}
    </div>
  );
}
