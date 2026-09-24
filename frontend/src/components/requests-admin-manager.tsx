"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  status?: string;
  created_at: string;
};

type VisitationItem = {
  id: number;
  requester_name: string;
  phone_number?: string;
  email?: string;
  visitation_type?: string;
  address?: string;
  reason?: string;
  preferred_date?: string;
  preferred_time?: string;
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

type JoinItem = {
  id: number;
  full_name: string;
  email: string;
  phone_number?: string;
  joining_mode: "baptism" | "membership_transfer" | "friend" | "sabbath_school";
  current_church?: string;
  status: "verification_pending" | "pending" | "approved" | "rejected" | "completed" | "expired";
  has_account: boolean;
  created_at: string;
};

/** Every request kind in one table, tagged by desk. */
type RequestKind = "join" | "prayer" | "visitation" | "dedication" | "welfare" | "transfer";

type UnifiedRow = {
  key: string;
  kind: RequestKind;
  /** The person or child the request is about. */
  title: string;
  /** Best contact line: phone and/or email. */
  contact: string;
  /** The one-line detail: the prayer text, visit type, join mode, and so on. */
  summary: string;
  /** Optional second detail line (church, dates, category). */
  meta?: string;
  status: string;
  /** Plain text for the status pill: "Awaiting approval", "New", ... */
  statusLabel: string;
  created_at?: string;
  /** Whether review actions (approve/reject) make sense for this row. */
  reviewable: boolean;
  /** Only set on join rows. */
  join?: JoinItem;
  /** Only set on transfer rows. */
  transferId?: number;
};

type KindFilter = "all" | RequestKind;

/** The review-state filter: everything, still to answer, or already answered. */
type StatusFilter = "all" | "pending" | "approved";

const KIND_META: Record<RequestKind, { label: string; badge: string }> = {
  join: { label: "Join requests", badge: "bg-[#b36b3c]/10 text-[#b36b3c]" },
  prayer: { label: "Prayer requests", badge: "bg-[#f1c89e]/25 text-[#96552c]" },
  visitation: { label: "Visitation", badge: "bg-[#5f8067]/10 text-[#2d5d39]" },
  dedication: { label: "Child dedications", badge: "bg-[#26352f]/10 text-[#26352f]" },
  welfare: { label: "Welfare & support", badge: "bg-[#9a741c]/10 text-[#7c5d16]" },
  transfer: { label: "Membership transfers", badge: "bg-[#617068]/10 text-[#415047]" },
};

const JOINING_MODE_LABELS: Record<string, string> = {
  baptism: "Joining by baptism",
  membership_transfer: "Membership transfer in",
  friend: "Friend of the church",
  sabbath_school: "Sabbath School attendee",
};

function statusOfJoin(item: JoinItem): { status: string; statusLabel: string } {
  if (item.status === "verification_pending") return { status: "verification_pending", statusLabel: "Awaiting their email" };
  if (item.status === "pending") return { status: "pending", statusLabel: "Awaiting approval" };
  if (item.status === "approved") return { status: "approved", statusLabel: "Approved" };
  if (item.status === "completed") return { status: "completed", statusLabel: "Completed" };
  if (item.status === "rejected") return { status: "rejected", statusLabel: "Rejected" };
  return { status: item.status, statusLabel: item.status };
}

function statusOfTransfer(status?: string): { status: string; statusLabel: string } {
  if (status === "pending") return { status: "pending", statusLabel: "Awaiting approval" };
  if (status === "under_review") return { status: "under_review", statusLabel: "Under review" };
  if (status === "approved") return { status: "approved", statusLabel: "Approved" };
  if (status === "completed") return { status: "completed", statusLabel: "Completed" };
  if (status === "cancelled") return { status: "cancelled", statusLabel: "Rejected" };
  return { status: status || "pending", statusLabel: status ? status.replace(/_/g, " ") : "Pending" };
}

function contactLine(...parts: (string | undefined)[]): string {
  const joined = parts.filter((part) => part && part.trim()).join(" · ");
  return joined || "—";
}

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

interface RequestsAdminManagerProps {
  initialTab?: KindFilter | "transfers";
}

export function RequestsAdminManager({ initialTab = "all" }: RequestsAdminManagerProps) {
  const [activeTab, setActiveTab] = useState<KindFilter>(initialTab === "transfers" ? "transfer" : initialTab);
  // The review-state filter. Pending leads by default — the desk exists to
  // answer people — while the desks filter itself starts at all.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [prayerRequests, setPrayerRequests] = useState<PrayerItem[]>([]);
  const [visitationRequests, setVisitationRequests] = useState<VisitationItem[]>([]);
  const [childDedications, setChildDedications] = useState<ChildDedicationItem[]>([]);
  const [supportSubmissions, setSupportSubmissions] = useState<SupportItem[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinItem[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [isElder, setIsElder] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The one search box, matched against names, contacts and summaries.
  const [search, setSearch] = useState("");

  // The filter popovers.
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab === "transfers" ? "transfer" : initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      const [jRes, pRes, vRes, dRes, sRes, tRes] = await Promise.all([
        fetch(`${API_URL}/api/members/enrollment-requests/`, { headers }),
        fetch(`${API_URL}/api/members/prayer-requests/`, { headers }),
        fetch(`${API_URL}/api/members/visitations/`, { headers }),
        fetch(`${API_URL}/api/members/child-dedications/`, { headers }),
        fetch(`${API_URL}/api/members/support-submissions/`, { headers }),
        fetch(`${API_URL}/api/members/transfers/`, { headers }),
      ]);
      setJoinRequests(jRes.ok ? await jRes.json() : []);
      setPrayerRequests(pRes.ok ? await pRes.json() : []);
      setVisitationRequests(vRes.ok ? await vRes.json() : []);
      setChildDedications(dRes.ok ? await dRes.json() : []);
      setSupportSubmissions(sRes.ok ? await sRes.json() : []);
      setTransfers(tRes.ok ? await tRes.json() : []);
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
          const roles = (Array.isArray(user?.roles) && user.roles.length > 0
            ? user.roles
            : [user?.role || ""]
          ).map((r: string) => r.toLowerCase().trim());
          setIsElder(roles.some((r: string) => ["admin", "elder", "clerk"].includes(r)) || Boolean(user?.is_staff));
        })
        .catch(() => setIsElder(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReviewJoin = async (id: number, decision: "approved" | "rejected") => {
    const confirmText = decision === "approved"
      ? "Approve this join request? The account will be activated and they can sign in."
      : "Reject this join request?";
    if (!confirm(confirmText)) return;

    setReviewingId(`join-${id}`);
    try {
      const res = await fetch(`${API_URL}/api/members/enrollment-requests/${id}/decision/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: decision }),
      });
      if (res.ok) {
        showAlert(
          decision === "approved" ? "Join Request Approved" : "Join Request Rejected",
          decision === "approved"
            ? "The account has been activated \u2014 they can now sign in."
            : "The join request was rejected.",
          "success"
        );
        fetchAll();
      } else {
        const data = await res.json().catch(() => null);
        showAlert("Review Failed", data?.detail || "Could not update the join request.", "error");
      }
    } catch {
      showAlert("Network Error", "Could not reach the server.", "error");
    } finally {
      setReviewingId(null);
    }
  };

  const handleReviewTransfer = async (id: number, decision: "approved" | "cancelled") => {
    const confirmText = decision === "approved"
      ? "Approve this transfer request?"
      : "Reject this transfer request?";
    if (!confirm(confirmText)) return;

    setReviewingId(`transfer-${id}`);
    try {
      const res = await fetch(`${API_URL}/api/members/transfers/${id}/`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
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
        fetchAll();
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

  // ── One table out of every ledger, newest first. ─────────────────────────
  const rows: UnifiedRow[] = useMemo(() => {
    const joinRows: UnifiedRow[] = joinRequests.map((item) => {
      const { status, statusLabel } = statusOfJoin(item);
      return {
        key: `join-${item.id}`,
        kind: "join",
        title: item.full_name,
        contact: contactLine(item.phone_number, item.email),
        summary: JOINING_MODE_LABELS[item.joining_mode] || item.joining_mode,
        meta: item.current_church ? `From ${item.current_church}` : undefined,
        status,
        statusLabel,
        created_at: item.created_at,
        reviewable: status === "pending" || status === "verification_pending",
        join: item,
      };
    });

    const prayerRows: UnifiedRow[] = prayerRequests.map((item) => ({
      key: `prayer-${item.id}`,
      kind: "prayer",
      title: item.anonymous ? "Anonymous" : item.name || "Church member",
      contact: contactLine(item.phone_number, item.email),
      summary: item.request_text,
      status: item.status || "new",
      statusLabel: item.status === "prayed" ? "Prayed" : item.status === "closed" ? "Closed" : "New",
      created_at: item.created_at,
      reviewable: false,
    }));

    const visitationRows: UnifiedRow[] = visitationRequests.map((item) => ({
      key: `visitation-${item.id}`,
      kind: "visitation",
      title: item.requester_name,
      contact: contactLine(item.phone_number, item.email),
      summary: item.reason || `${item.visitation_type ? item.visitation_type.replace(/_/g, " ") : "Visit"} request`,
      meta: [item.preferred_date, item.preferred_time].filter(Boolean).join(" ") || undefined,
      status: item.status || "pending",
      statusLabel: (item.status || "pending").replace(/_/g, " "),
      created_at: item.created_at,
      reviewable: false,
    }));

    const dedicationRows: UnifiedRow[] = childDedications.map((item) => ({
      key: `dedication-${item.id}`,
      kind: "dedication",
      title: item.child_name,
      contact: contactLine(item.phone_number),
      summary: [item.father_name && `Father: ${item.father_name}`, item.mother_name && `Mother: ${item.mother_name}`]
        .filter(Boolean)
        .join(" · "),
      meta: item.child_dob ? `Born ${item.child_dob}` : undefined,
      status: item.status || "pending",
      statusLabel: (item.status || "pending").replace(/_/g, " "),
      created_at: item.created_at,
      reviewable: false,
    }));

    const welfareRows: UnifiedRow[] = supportSubmissions.map((item) => ({
      key: `welfare-${item.id}`,
      kind: "welfare",
      title: item.anonymous ? "Anonymous" : item.name || "Church member",
      contact: contactLine(item.phone_number, item.email),
      summary: item.content,
      meta: item.category ? `Category: ${item.category}` : item.submission_type?.replace(/_/g, " "),
      status: "received",
      statusLabel: "Received",
      created_at: item.created_at,
      reviewable: false,
    }));

    const transferRows: UnifiedRow[] = transfers.map((t) => {
      const { status, statusLabel } = statusOfTransfer(t.status);
      return {
        key: `transfer-${t.id}`,
        kind: "transfer",
        title: t.member_name,
        contact: contactLine(t.phone_number, t.email),
        summary: t.transfer_type === "outgoing" ? `Transfer out to ${t.other_church}` : `Transfer in from ${t.other_church}`,
        meta: t.reason,
        status,
        statusLabel,
        created_at: t.created_at,
        reviewable: status === "pending" || status === "under_review",
        transferId: t.id,
      };
    });

    return [...joinRows, ...prayerRows, ...visitationRows, ...dedicationRows, ...welfareRows, ...transferRows].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  }, [joinRequests, prayerRequests, visitationRequests, childDedications, supportSubmissions, transfers]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeTab !== "all" && row.kind !== activeTab) return false;
      // The review-state filter maps each desk's own statuses onto the three
      // buckets: waiting-on-us, answered-yes, and everything else.
      if (statusFilter === "pending" && !(row.status === "pending" || row.status === "verification_pending" || row.status === "under_review" || row.status === "received")) return false;
      if (statusFilter === "approved" && row.status !== "approved" && row.status !== "completed") return false;
      if (!query) return true;
      return (
        row.title.toLowerCase().includes(query) ||
        row.contact.toLowerCase().includes(query) ||
        row.summary.toLowerCase().includes(query) ||
        (row.meta || "").toLowerCase().includes(query) ||
        row.statusLabel.toLowerCase().includes(query) ||
        KIND_META[row.kind].label.toLowerCase().includes(query)
      );
    });
  }, [rows, activeTab, search]);

  const kindCount = (kind: KindFilter) => (kind === "all" ? rows.length : rows.filter((r) => r.kind === kind).length);

  const statusCount = (filter: StatusFilter) =>
    rows.filter((row) => {
      if (activeTab !== "all" && row.kind !== activeTab) return false;
      if (filter === "pending") return row.status === "pending" || row.status === "verification_pending" || row.status === "under_review" || row.status === "received";
      if (filter === "approved") return row.status === "approved" || row.status === "completed";
      return true;
    }).length;

  const statusFilterOptions: { value: StatusFilter; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "all", label: "All" },
  ];

  const activeStatusLabel = statusFilterOptions.find((option) => option.value === statusFilter)?.label || "Pending";

  const filterOptions: { value: KindFilter; label: string }[] = [
    { value: "all", label: "All requests" },
    { value: "join", label: "Join requests" },
    { value: "prayer", label: "Prayer requests" },
    { value: "visitation", label: "Visitation" },
    { value: "dedication", label: "Child dedications" },
    { value: "welfare", label: "Welfare & support" },
    { value: "transfer", label: "Membership transfers" },
  ];

  const activeFilterLabel = activeTab === "all" ? "All requests" : KIND_META[activeTab].label;

  return (
    <div className="flex h-full min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      {/* Pinned header: title row, then one toolbar row — search, the two
          filter popovers, and the metrics on the far right. The table
          beneath scrolls under it. */}
      <div className="shrink-0 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#26352f]">Received Requests</h2>
          <p className="mt-0.5 text-sm text-[#617068]">
            Join requests, prayer, visitation, dedications, welfare and membership transfers — one table.
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="shrink-0 rounded-full border border-[#c9c5bb] px-4 py-2 text-xs font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]"
        >
          ↻ Refresh
        </button>
      </div>

      {/* One search bar + two popover filters + metrics, all on one row. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#617068]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, contact, details..."
            className="w-full rounded-full border border-[#c9c5bb] bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#b36b3c]"
          />
        </div>

        {/* Status filter: pending by default — the desk exists to answer. */}
        <div className="relative" ref={statusRef}>
          <button
            type="button"
            onClick={() => setStatusOpen((open) => !open)}
            aria-expanded={statusOpen}
            className="inline-flex items-center gap-2 rounded-full border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm font-semibold text-[#26352f] transition hover:border-[#b36b3c]"
          >
            <svg className={`h-2 w-2 shrink-0 rounded-full ${statusFilter === "pending" ? "bg-amber-500" : statusFilter === "approved" ? "bg-emerald-600" : "bg-[#617068]"}`} viewBox="0 0 8 8" aria-hidden="true" />
            {activeStatusLabel}
            <span className="rounded-full bg-[#f7f4ee] px-2 py-0.5 text-[10px] font-bold text-[#617068]">{statusCount(statusFilter)}</span>
            <svg className={`h-3 w-3 text-[#617068] transition-transform ${statusOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {statusOpen && (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-[#dfdbd1] bg-white py-2 shadow-xl"
            >
              <p className="px-4 pb-1.5 pt-1 text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
                Show by review state
              </p>
              {statusFilterOptions.map((option) => {
                const count = statusCount(option.value);
                const selected = statusFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      setStatusFilter(option.value);
                      setStatusOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                      selected ? "bg-[#f7f4ee] font-semibold text-[#26352f]" : "text-[#415047] hover:bg-[#f7f4ee]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {selected && <span className="text-[#b36b3c]">✓</span>}
                      <span className={selected ? "" : "pl-5"}>{option.label}</span>
                    </span>
                    <span className="rounded-full bg-[#f7f4ee] px-2 py-0.5 text-[10px] font-bold text-[#617068]">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterOpen((open) => !open)}
            aria-expanded={filterOpen}
            className="inline-flex items-center gap-2 rounded-full border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm font-semibold text-[#26352f] transition hover:border-[#b36b3c]"
          >
            <svg className="h-4 w-4 text-[#617068]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M10 20h4" />
            </svg>
            Filter
            {activeTab !== "all" && (
              <span className="rounded-full bg-[#26352f] px-2 py-0.5 text-[10px] font-bold text-white">{activeFilterLabel}</span>
            )}
            <svg className={`h-3 w-3 text-[#617068] transition-transform ${filterOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {filterOpen && (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 max-h-80 w-64 overflow-y-auto rounded-2xl border border-[#dfdbd1] bg-white py-2 shadow-xl"
            >
              <p className="px-4 pb-1.5 pt-1 text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
                Show requests by desk
              </p>
              {filterOptions.map((option) => {
                const count = kindCount(option.value);
                const selected = activeTab === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      setActiveTab(option.value);
                      setFilterOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                      selected ? "bg-[#f7f4ee] font-semibold text-[#26352f]" : "text-[#415047] hover:bg-[#f7f4ee]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {selected && <span className="text-[#b36b3c]">✓</span>}
                      <span className={selected ? "" : "pl-5"}>{option.label}</span>
                    </span>
                    <span className="rounded-full bg-[#f7f4ee] px-2 py-0.5 text-[10px] font-bold text-[#617068]">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* The metrics sit on the toolbar row's far right; the table beneath
          is the scrolling region. */}
      <div className="flex shrink-0 items-center justify-end pb-1 text-xs text-[#617068]">
        <span className="text-right">
          {filteredRows.length} of {rows.length} request{rows.length === 1 ? "" : "s"}
          {activeTab !== "all" ? ` · ${activeFilterLabel}` : ""}
          {statusFilter !== "all" ? ` · ${activeStatusLabel.toLowerCase()}` : ""}
          {search.trim() ? ` · matching “${search.trim()}”` : ""}
        </span>
      </div>
      </div>

      {/* The table scrolls beneath the pinned toolbar. */}
      <div className="min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar">
      {loading && (
        <div className="rounded-2xl border border-[#dfdbd1] bg-white p-8 text-center text-sm text-[#617068]">
          Loading requests...
        </div>
      )}

      {!loading && (
        <div className="overflow-hidden rounded-2xl border border-[#dfdbd1] bg-white">
          {filteredRows.length === 0 ? (
            <div className="p-8 sm:p-12 text-center">
              <span className="text-4xl" aria-hidden="true">
                🤝
              </span>
              <h3 className="mt-3 text-lg font-semibold text-[#26352f]">No requests found</h3>
              <p className="mt-1 text-sm text-[#617068]">
                {rows.length === 0
                  ? "Join, prayer, visitation, dedication, welfare and transfer requests will appear here."
                  : "Try a different search or clear the filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#dfdbd1] bg-[#faf9f5] text-[11px] uppercase tracking-wide text-[#617068]">
                    <th className="px-4 py-3 font-semibold">Request</th>
                    <th className="px-4 py-3 font-semibold">Desk</th>
                    <th className="px-4 py-3 font-semibold">Details</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Submitted</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.key} className="border-b border-[#dfdbd1]/60 align-top last:border-0 hover:bg-[#faf9f5]">
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="truncate font-semibold text-[#26352f]">{row.title}</p>
                        <p className="mt-0.5 truncate text-xs text-[#617068]">{row.contact}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${KIND_META[row.kind].badge}`}>
                          {KIND_META[row.kind].label}
                        </span>
                      </td>
                      <td className="max-w-[280px] px-4 py-3">
                        <p className="line-clamp-2 text-[#415047]">{row.summary}</p>
                        {row.meta && <p className="mt-0.5 truncate text-xs text-[#617068]">{row.meta}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                            row.status === "pending" || row.status === "verification_pending" || row.status === "under_review" || row.status === "new" || row.status === "received"
                              ? "bg-amber-100 text-amber-800"
                              : row.status === "approved" || row.status === "completed"
                                ? "bg-emerald-100 text-emerald-800"
                                : row.status === "rejected" || row.status === "cancelled"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-[#f7f4ee] text-[#617068]"
                          }`}
                        >
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-[#617068]">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        {row.reviewable && isElder && (
                          <div className="flex justify-end gap-2">
                            {row.join && (
                              <>
                                <button
                                  type="button"
                                  disabled={reviewingId === row.key}
                                  onClick={() => handleReviewJoin(row.join!.id, "approved")}
                                  className="rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                                >
                                  {reviewingId === row.key ? "..." : "✓ Approve"}
                                </button>
                                <button
                                  type="button"
                                  disabled={reviewingId === row.key}
                                  onClick={() => handleReviewJoin(row.join!.id, "rejected")}
                                  className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                                >
                                  ✕ Reject
                                </button>
                              </>
                            )}
                            {row.transferId && (
                              <>
                                <button
                                  type="button"
                                  disabled={reviewingId === row.key}
                                  onClick={() => handleReviewTransfer(row.transferId!, "approved")}
                                  className="rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                                >
                                  {reviewingId === row.key ? "..." : "✓ Approve"}
                                </button>
                                <button
                                  type="button"
                                  disabled={reviewingId === row.key}
                                  onClick={() => handleReviewTransfer(row.transferId!, "cancelled")}
                                  className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                                >
                                  ✕ Reject
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Still verifying their email — a hint the old joins tab carried. */}
      {!loading && joinRequests.some((j) => j.status === "verification_pending") && (activeTab === "all" || activeTab === "join") && (
        <p className="rounded-2xl bg-[#f7f4ee] p-4 text-xs italic text-[#415047]">
          Requests marked <strong>Awaiting their email</strong> can be approved now — the account activates as soon as the person
          finishes signing up.
        </p>
      )}

      {/* The manual transfer desk keeps its fuller manager (add records, change
          statuses) — reachable from the filter, labelled the same way. */}
      {activeTab === "transfer" && (
        <div className="pt-2">
          <TransferManagement />
        </div>
      )}
      </div>
    </div>
  );
}

type TransferRow = {
  id: number;
  member_name: string;
  transfer_type: "incoming" | "outgoing";
  other_church: string;
  reason?: string;
  phone_number?: string;
  email?: string;
  status: "pending" | "under_review" | "approved" | "completed" | "cancelled";
  created_at: string;
};
