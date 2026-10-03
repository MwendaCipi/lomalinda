"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePageHeader } from "@/components/app-frame";

import { showAlert } from "@/lib/alerts";
import { dayFirstTime } from "@/lib/dates";
import { reviewBucket, type StatusFilter } from "@/lib/requests";
import { Check, Handshake, X } from "lucide-react";
import { BackToOverviewArrow } from "@/components/back-to-overview-arrow";
import { RecordList } from "./record-list";
import { densityCellPad } from "@/lib/table-density";
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
  joining_mode: "baptism" | "membership_transfer" | "transfer_in" | "friend" | "sabbath_school";
  current_church?: string;
  status: "verification_pending" | "pending" | "approved" | "rejected" | "completed" | "expired";
  has_account: boolean;
  created_at: string;
};

/** A member's ask a department desk answers: to join the area, or to open a
    singing group under it. One ledger, one review endpoint, so the queue
    renders both as one desk. */
type AreaRequestRow = {
  id: number;
  department: string;
  kind: "join" | "singing_group";
  group_name?: string;
  group_description?: string;
  member_id: number;
  member_name: string;
  member_email?: string;
  member_phone?: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  reply?: string;
  created_at: string;
};

/** The deaconate desk's ask of the office: buy an item, or repair one. */
type DeaconateRequestItem = {
  id: number;
  kind: "buy" | "repair";
  item_name: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  reply?: string;
  requested_by_name?: string;
  created_at: string;
};

/** The desks' own asks share the review states the office already reads. */
function statusOfArea(status?: string): { status: string; statusLabel: string } {
  if (status === "pending") return { status: "pending", statusLabel: "Awaiting approval" };
  if (status === "approved") return { status: "approved", statusLabel: "Approved" };
  if (status === "rejected") return { status: "rejected", statusLabel: "Rejected" };
  return { status: status || "pending", statusLabel: (status || "pending").replace(/_/g, " ") };
}

/** Every request kind in one table, tagged by desk. */
type RequestKind = "join" | "area" | "prayer" | "visitation" | "dedication" | "welfare" | "transfer" | "property";

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
  /** Only set on area rows: join an area / propose a singing group. */
  areaRequest?: AreaRequestRow;
  /** Only set on property rows: the deaconate's buy/repair ask. */
  property?: DeaconateRequestItem;
};

type KindFilter = "all" | RequestKind;

/** The membership desk filters by its own statuses, not the shared buckets. */
type TransferOnlyStatus = "under_review" | "completed" | "cancelled";

/** Pill colour for a request status, shared by the table and the phone cards. */
const statusPillClass = (status: string) =>
  status === "pending" || status === "verification_pending" || status === "under_review" || status === "new" || status === "received"
    ? "bg-amber-100 text-amber-800"
    : status === "approved" || status === "completed"
      ? "bg-emerald-100 text-emerald-800"
      : status === "rejected" || status === "cancelled"
        ? "bg-rose-100 text-rose-800"
        : "bg-sand text-moss";

const KIND_META: Record<RequestKind, { label: string; badge: string }> = {
  join: { label: "Join requests", badge: "bg-ember/10 text-ember" },
  prayer: { label: "Prayer requests", badge: "bg-gold/25 text-ember-deep" },
  visitation: { label: "Visitation", badge: "bg-sage/10 text-sage-bright" },
  dedication: { label: "Child dedications", badge: "bg-bark/10 text-bark" },
  welfare: { label: "Welfare & support", badge: "bg-gold-deep/10 text-gold-shadow" },
  transfer: { label: "Membership transfer", badge: "bg-moss/10 text-moss-mid" },
  area: { label: "Area requests", badge: "bg-blue-50 text-blue-800" },
  property: { label: "Property requests", badge: "bg-amber-50 text-amber-800" },
};

const JOINING_MODE_LABELS: Record<string, string> = {
  baptism: "Joining by baptism",
  membership_transfer: "A church member",
  transfer_in: "Membership transfer in",
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
  return value ? dayFirstTime(value, "") : "";
}

interface RequestsAdminManagerProps {
  initialTab?: KindFilter | "transfers";
  /** ``<kind>-<id>``, as the email about a request links to it. */
  focusRequest?: string | null;
}

export function RequestsAdminManager({ initialTab = "all", focusRequest = null }: RequestsAdminManagerProps) {
  const [activeTab, setActiveTab] = useState<KindFilter>(initialTab === "transfers" ? "transfer" : initialTab);
  // The review-state filter. Pending leads by default — the desk exists to
  // answer people — while the desks filter itself starts at all.
  const [statusFilter, setStatusFilter] = useState<StatusFilter | TransferOnlyStatus>("pending");
  const [prayerRequests, setPrayerRequests] = useState<PrayerItem[]>([]);
  const [visitationRequests, setVisitationRequests] = useState<VisitationItem[]>([]);
  const [childDedications, setChildDedications] = useState<ChildDedicationItem[]>([]);
  const [supportSubmissions, setSupportSubmissions] = useState<SupportItem[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinItem[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [areaRequests, setAreaRequests] = useState<AreaRequestRow[]>([]);
  const [deaconateRequests, setDeaconateRequests] = useState<DeaconateRequestItem[]>([]);
  // Department codes read as names in the queue — from the same directory
  // the members' own ask modal reads.
  const [areaLabels, setAreaLabels] = useState<Record<string, string>>({});
  const [isElder, setIsElder] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // One desk-wide row density, shared with the roster and the other tables.
  const rowPad = densityCellPad();
  // The one request a notification email pointed at, so the desk can show it
  // rather than leaving an elder to hunt through every desk for it.
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const focusApplied = useRef<string | null>(null);

  // The one search box, matched against names, contacts and summaries.
  const [search, setSearch] = useState("");

  // The filter popover, and the review-state one that rides beside it on the
  // desks that read a queue. The Membership Requests desk keeps the funnel
  // alone, so its header stays a single control.
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const { setHeaderRightAction } = usePageHeader();
  useEffect(() => {
    const statusOpts: { value: string; label: string }[] =
      activeTab === "transfer"
        ? [
            { value: "pending", label: "Pending" },
            { value: "under_review", label: "Under review" },
            { value: "approved", label: "Approved" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
            { value: "all", label: "All" },
          ]
        : [
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "all", label: "All" },
          ];
    // Short labels: the popover is a jump between desks, not an explanation,
    // and the long names are what made it occupy most of the header.
    const deskOpts: { value: KindFilter; label: string }[] = [
      { value: "all", label: "All requests" },
      { value: "join", label: "Join" },
      { value: "area", label: "Area" },
      { value: "prayer", label: "Prayer" },
      { value: "visitation", label: "Visitation" },
      { value: "dedication", label: "Dedication" },
      { value: "welfare", label: "Welfare" },
      { value: "transfer", label: "Transfers" },
      { value: "property", label: "Property" },
    ];
    // Membership Requests reads every request and shows each row's state, so
    // it needs no review-state control — one popover, and a narrow one.
    const showStateFilter = activeTab !== "transfer";
    setHeaderRightAction(
      <div className="flex items-center gap-2">
        {showStateFilter && (
        <div className="relative" ref={statusRef}>
          <button
            type="button"
            onClick={() => setStatusOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-full border border-sand-mute bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember"
          >
            <svg className={`h-2 w-2 shrink-0 rounded-full ${statusFilter === "pending" ? "bg-amber-500" : statusFilter === "approved" || statusFilter === "completed" ? "bg-emerald-600" : statusFilter === "rejected" || statusFilter === "cancelled" ? "bg-rose-500" : statusFilter === "under_review" ? "bg-blue-500" : "bg-moss"}`} viewBox="0 0 8 8" aria-hidden="true" />
            {statusOpts.find((o) => o.value === statusFilter)?.label ?? "Pending"}
            <svg className={`h-3 w-3 text-moss transition-transform ${statusOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {statusOpen && (
            <div role="menu" className="absolute right-0 z-50 mt-2 w-52 rounded-2xl border border-sand-line bg-white py-2 shadow-xl">
              <p className="px-4 pb-1.5 pt-1 text-[10px] font-extrabold uppercase tracking-wider text-moss">Show by review state</p>
              {statusOpts.map((option) => (
                <button key={option.value} type="button" role="menuitemradio" aria-checked={statusFilter === option.value}
                  onClick={() => { setStatusFilter(option.value as StatusFilter); setStatusOpen(false); }}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-xs transition ${statusFilter === option.value ? "bg-sand font-semibold text-bark" : "text-moss-mid hover:bg-sand"}`}>
                  <span className="flex items-center gap-2">
                    {statusFilter === option.value && <svg className="h-3 w-3 text-ember" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                    <span className={statusFilter === option.value ? "" : "pl-4"}>{option.label}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}
        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-full border border-sand-mute bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember"
          >
            <svg className="h-3.5 w-3.5 text-moss" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M10 20h4" /></svg>
            Filter
            <svg className={`h-3 w-3 text-moss transition-transform ${filterOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {filterOpen && (
            <div role="menu" className="absolute right-0 z-50 mt-2 max-h-80 w-44 overflow-y-auto rounded-2xl border border-sand-line bg-white py-2 shadow-xl">
              <p className="px-4 pb-1.5 pt-1 text-[10px] font-extrabold uppercase tracking-wider text-moss">Show requests by desk</p>
              {deskOpts.map((option) => (
                <button key={option.value} type="button" role="menuitemradio" aria-checked={activeTab === option.value}
                  onClick={() => { setActiveTab(option.value); setStatusFilter("pending"); setFilterOpen(false); }}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-xs transition ${activeTab === option.value ? "bg-sand font-semibold text-bark" : "text-moss-mid hover:bg-sand"}`}>
                  <span className="flex items-center gap-2">
                    {activeTab === option.value && <svg className="h-3 w-3 text-ember" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                    <span className={activeTab === option.value ? "" : "pl-4"}>{option.label}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative w-44 sm:w-56">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moss" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search requests..."
            className="w-full rounded-full border border-sand-mute bg-white py-1.5 pl-9 pr-3 text-xs outline-none transition focus:border-ember"
          />
        </div>
      </div>
    );
    return () => setHeaderRightAction(null);
  }, [search, statusFilter, filterOpen, statusOpen, activeTab, setHeaderRightAction]);

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
      const [jRes, pRes, vRes, dRes, sRes, tRes, aRes, dqRes, dirRes] = await Promise.all([
        fetch(`${API_URL}/api/members/enrollment-requests/`, { headers }),
        fetch(`${API_URL}/api/members/prayer-requests/`, { headers }),
        fetch(`${API_URL}/api/members/visitations/`, { headers }),
        fetch(`${API_URL}/api/members/child-dedications/`, { headers }),
        fetch(`${API_URL}/api/members/support-submissions/`, { headers }),
        fetch(`${API_URL}/api/members/transfers/`, { headers }),
        // The desks' own asks — join an area, propose a singing group — from
        // the one review endpoint that also answers them.
        fetch(`${API_URL}/api/members/department-join-requests/review/`, { headers }),
        // The deaconate desk's property asks — buy or repair — answered here.
        fetch(`${API_URL}/api/members/deaconate-requests/review/`, { headers }),
        fetch(`${API_URL}/api/members/departments/`, { headers }),
      ]);
      setJoinRequests(jRes.ok ? await jRes.json() : []);
      setPrayerRequests(pRes.ok ? await pRes.json() : []);
      setVisitationRequests(vRes.ok ? await vRes.json() : []);
      setChildDedications(dRes.ok ? await dRes.json() : []);
      setSupportSubmissions(sRes.ok ? await sRes.json() : []);
      setTransfers(tRes.ok ? await tRes.json() : []);
      setAreaRequests(aRes.ok ? (await aRes.json()).requests ?? [] : []);
      setDeaconateRequests(dqRes.ok ? (await dqRes.json()).requests ?? [] : []);
      const dirData = dirRes.ok ? await dirRes.json() : { departments: [] };
      const labelMap: Record<string, string> = {};
      for (const d of (dirData?.departments ?? []) as { code: string; label: string }[]) labelMap[d.code] = d.label;
      setAreaLabels(labelMap);
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
          // Review powers ride the roles the API itself enforces; a desk lead
          // (pastor, chaplain, children, welfare) reads their desks here but
          // join/transfer decisions stay with the office.
          setIsElder(
            roles.some((r: string) =>
              ["admin", "elder", "clerk", "pastor", "chaplaincy", "children_ministry", "welfare_leader"].includes(r)
            ) || Boolean(user?.is_staff)
          );
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

  // The desks' own asks — join an area, propose a singing group — answered
  // by the one review endpoint the department leadership and the office share.
  const handleReviewArea = async (id: number, decision: "approved" | "rejected", area: AreaRequestRow) => {
    const isGroup = area.kind === "singing_group";
    const confirmText = decision === "approved"
      ? isGroup
        ? `Approve "${area.group_name}"? The group is registered under ${area.department.replace(/_/g, " ")} and ${area.member_name} becomes its first singer.`
        : "Approve this request? The member is added to the area's roll."
      : isGroup
        ? `Decline the proposal for "${area.group_name}"?`
        : "Decline this join request?";
    const result = await showAlert(
      isGroup ? "Singing group proposal" : "Area request",
      confirmText,
      "question",
      { showCancelButton: true, confirmButtonText: decision === "approved" ? "Approve" : "Decline", cancelButtonText: "Cancel", confirmButtonColor: "#3085d6" }
    );
    if (!result.isConfirmed) return;

    setReviewingId(`area-${id}`);
    try {
      const res = await fetch(`${API_URL}/api/members/department-join-requests/${id}/`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: decision }),
      });
      if (res.ok) {
        showAlert(
          decision === "approved" ? "Request approved" : "Request declined",
          isGroup
            ? decision === "approved"
              ? `"${area.group_name}" is registered, and ${area.member_name} is its first singer.`
              : "The proposal was declined."
            : decision === "approved"
              ? "The member is now on the area's roll."
              : "The request was declined.",
          "success"
        );
        fetchAll();
      } else {
        const data = await res.json().catch(() => null);
        showAlert("Review Failed", data?.detail || "Could not update the request.", "error");
      }
    } catch {
      showAlert("Network Error", "Could not reach the server.", "error");
    } finally {
      setReviewingId(null);
    }
  };

  /** The office's answer to a property request: approve or decline. The
      deaconate desk reads the answer as a notification either way. */
  const handleReviewProperty = async (id: number, decision: "approved" | "rejected") => {
    const confirmText = decision === "approved"
      ? "Approve this property request? The desk takes the next step with the treasurer."
      : "Decline this property request?";
    const result = await showAlert(
      "Property request",
      confirmText,
      "question",
      { showCancelButton: true, confirmButtonText: decision === "approved" ? "Approve" : "Decline", cancelButtonText: "Cancel" }
    );
    if (!result.isConfirmed) return;
    setReviewingId(`property-${id}`);
    try {
      const res = await fetch(`${API_URL}/api/members/deaconate-requests/${id}/`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: decision }),
      });
      if (res.ok) {
        showAlert(
          decision === "approved" ? "Request approved" : "Request declined",
          decision === "approved"
            ? "The deaconate desk has your approval."
            : "The request was declined.",
          "success"
        );
        fetchAll();
      } else {
        const data = await res.json().catch(() => null);
        showAlert("Review Failed", data?.detail || "Could not update the request.", "error");
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

    const propertyRows: UnifiedRow[] = deaconateRequests.map((item) => ({
      key: `property-${item.id}`,
      kind: "property",
      title: item.item_name,
      contact: item.requested_by_name || "Deaconate desk",
      summary:
        item.kind === "repair"
          ? `Repairs to ${item.item_name}`
          : `The deaconate asks to buy ${item.item_name}`,
      meta: item.note || undefined,
      status: item.status,
      statusLabel: statusOfArea(item.status).statusLabel,
      created_at: item.created_at,
      reviewable: item.status === "pending",
      property: item,
    }));

    const areaRows: UnifiedRow[] = areaRequests.map((item) => {
      const { status, statusLabel } = statusOfArea(item.status);
      const isGroup = item.kind === "singing_group";
      const label = areaLabels[item.department] || item.department.replace(/_/g, " ");
      return {
        key: `area-${item.id}`,
        kind: "area",
        title: item.member_name,
        contact: contactLine(item.member_phone, item.member_email),
        summary: isGroup
          ? `Proposes the singing group "${item.group_name || "?"}" under ${label}`
          : `Asks to join ${label}`,
        meta: [isGroup ? item.group_description : null, item.note].filter(Boolean).join(" · ") || undefined,
        status,
        statusLabel,
        created_at: item.created_at,
        reviewable: status === "pending",
        areaRequest: item,
      };
    });

    return [...joinRows, ...areaRows, ...propertyRows, ...prayerRows, ...visitationRows, ...dedicationRows, ...welfareRows, ...transferRows].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  }, [joinRequests, areaRequests, deaconateRequests, areaLabels, prayerRequests, visitationRequests, childDedications, supportSubmissions, transfers]);

  // A link from a request notification arrives as ?request=<kind>-<id>. The
  // filters are moved to that row once the ledgers have loaded, and only once,
  // so the reader can then change them freely.
  useEffect(() => {
    if (!focusRequest || loading) return;
    if (focusApplied.current === focusRequest) return;
    const row = rows.find((item) => item.key === focusRequest);
    if (!row) return;
    focusApplied.current = focusRequest;
    setHighlightKey(focusRequest);
    setActiveTab(row.kind);
    setStatusFilter("all");
    setSearch("");
  }, [focusRequest, loading, rows]);

  // The Membership Requests desk carries no review-state control, so nothing
  // may hide its rows behind a state: it reads them all, and each row shows
  // where it stands. Derived rather than written into the state, so the desk
  // needs no effect and no request ever disappears behind a control that is
  // not on screen.
  const reviewFilter: StatusFilter | TransferOnlyStatus =
    activeTab === "transfer" ? "all" : statusFilter;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeTab !== "all" && row.kind !== activeTab) return false;
      if (reviewFilter !== "all") {
        if (activeTab === "transfer" && row.kind === "transfer") {
          if (row.status !== reviewFilter) return false;
        } else if (reviewBucket(row) !== (reviewFilter as StatusFilter)) {
          return false;
        }
      }
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
  }, [rows, activeTab, search, reviewFilter]);

  // Shared by the desktop table and the phone cards: RecordList renders one
  // empty state for whichever layout is on screen.
  const requestsEmptyState = (
    <div>
      <Handshake size={36} className="text-moss-faint" aria-hidden="true" />
      <h3 className="mt-3 text-lg font-semibold text-bark">No requests found</h3>
      <p className="mt-1 text-sm text-moss">
        {rows.length === 0
          ? "Join, area, prayer, visitation, dedication, welfare and transfer requests will appear here."
          : "Try a different search or clear the filter."}
      </p>
    </div>
  );

  // Scrolling waits for the row to exist: the filters the link set change what
  // is rendered, so the element only appears on the following pass.
  useEffect(() => {
    if (!highlightKey) return;
    // Both layouts carry the marker; scroll the one actually on screen (the
    // hidden twin is display:none and has no box to scroll to).
    const candidates = document.querySelectorAll<HTMLElement>(`[data-request-row="${highlightKey}"]`);
    const element = Array.from(candidates).find((el) => el.offsetParent !== null) ?? candidates[0];
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightKey, filteredRows]);

  const kindCount = (kind: KindFilter) => (kind === "all" ? rows.length : rows.filter((r) => r.kind === kind).length);

  const statusCount = (filter: string) =>
    rows.filter((row) => {
      if (activeTab !== "all" && row.kind !== activeTab) return false;
      if (filter === "all") return true;
      // The membership desk reads its own statuses; everywhere else the
      // shared review buckets answer.
      if (activeTab === "transfer" && row.kind === "transfer") return row.status === filter;
      return reviewBucket(row) === (filter as StatusFilter);
    }).length;

  // On the membership desk the filter reads the desk's own statuses; the
  // other desks keep the three review buckets.
  const statusFilterOptions: { value: string; label: string }[] =
    activeTab === "transfer"
      ? [
          { value: "pending", label: "Pending" },
          { value: "under_review", label: "Under review" },
          { value: "approved", label: "Approved" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
          { value: "all", label: "All" },
        ]
      : [
          { value: "pending", label: "Pending" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Rejected" },
          { value: "all", label: "All" },
        ];

  const activeStatusLabel = statusFilterOptions.find((option) => option.value === statusFilter)?.label || "Pending";

  const filterOptions: { value: KindFilter; label: string }[] = [
    { value: "all", label: "All requests" },
    { value: "join", label: "Join requests" },
    { value: "area", label: "Area requests" },
    { value: "prayer", label: "Prayer requests" },
    { value: "visitation", label: "Visitation" },
    { value: "dedication", label: "Child dedications" },
    { value: "welfare", label: "Welfare & support" },
    { value: "transfer", label: "Membership transfer" },
    { value: "property", label: "Property requests" },
  ];

  const activeFilterLabel = activeTab === "all" ? "All requests" : KIND_META[activeTab].label;

  return (
    <div className="flex h-full min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      {/* Pinned header: title row, then one toolbar row — search, the two
          filter popovers, and the metrics on the far right. The table
          beneath scrolls under it. */}
      <div className="shrink-0 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <BackToOverviewArrow />
          {/* Named by the strip above on a wide screen. */}
          <div className="md:hidden">
            <h2 className="text-2xl font-semibold text-bark">Received Requests</h2>
            <p className="mt-0.5 text-sm text-moss">
              Join requests, prayer, visitation, dedications, welfare and membership transfers — one table.
            </p>
          </div>
        </div>
      </div>

      {/* The metrics sit on the toolbar row's far right; the table beneath
          is the scrolling region. */}
      <div className="flex shrink-0 items-center justify-end gap-2 pb-1 text-xs text-moss">
        <span className="text-right">
          {filteredRows.length} of {rows.length} request{rows.length === 1 ? "" : "s"}
          {activeTab !== "all" ? ` · ${activeFilterLabel}` : ""}
          {reviewFilter !== "all" ? ` · ${activeStatusLabel.toLowerCase()}` : ""}
          {search.trim() ? ` · matching “${search.trim()}”` : ""}
        </span>
      </div>
      </div>

      {/* The table scrolls beneath the pinned toolbar. */}
      <div className="min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar">
        {/* Table on desktop, cards on phones — RecordList owns the breakpoint
            pair, so the two layouts can't drift apart again. */}
        <RecordList
          rows={filteredRows}
          loading={loading}
          rowKey={(row) => row.key}
          tableWrapperClassName="overflow-x-auto rounded-2xl border border-sand-line bg-white"
          tableClassName="w-full min-w-[720px] text-left text-sm"
          headClassName="border-b border-sand-line bg-sand-card text-[11px] uppercase tracking-wide text-moss"
          headRowClassName=""
          headCellClassName="px-4 py-3 font-semibold"
          bodyClassName=""
          headers={[
            { label: "Request" },
            { label: "Desk" },
            { label: "Details" },
            { label: "Status" },
            { label: "Submitted" },
            { label: "Actions", className: "text-right" },
          ]}
          loadingLabel="Loading requests..."
          stateClassName="p-8 sm:p-12 text-center"
          tableEmpty={requestsEmptyState}
          cardsEmpty={requestsEmptyState}
          cardsClassName="grid gap-3 p-3"
          renderRow={(row) => (
            <tr
              data-request-row={row.key}
              className={`border-b border-sand-line/60 align-top last:border-0 ${
                highlightKey === row.key
                  ? "bg-sand-bright ring-1 ring-inset ring-ember/40"
                  : "hover:bg-sand-card"
              }`}
            >
              <td className={`max-w-[220px] px-4 ${rowPad}`}>
                <p className="truncate font-semibold text-bark">{row.title}</p>
                <p className="mt-0.5 truncate text-xs text-moss">{row.contact}</p>
              </td>
              <td className={`px-4 ${rowPad}`}>
                <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${KIND_META[row.kind].badge}`}>
                  {KIND_META[row.kind].label}
                </span>
              </td>
              <td className={`max-w-[280px] px-4 ${rowPad}`}>
                <p className="line-clamp-2 text-moss-mid">{row.summary}</p>
                {row.meta && <p className="mt-0.5 truncate text-xs text-moss">{row.meta}</p>}
              </td>
              <td className={`px-4 ${rowPad}`}>
                <span
                  className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusPillClass(row.status)}`}
                >
                  {row.statusLabel}
                </span>
              </td>
              <td className={`whitespace-nowrap px-4 ${rowPad} text-xs text-moss`}>{formatDate(row.created_at)}</td>
              <td className={`px-4 ${rowPad}`}>
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
                          {reviewingId === row.key ? "..." : <><Check size={12} className="inline" aria-hidden="true" /> Approve</>}
                        </button>
                        <button
                          type="button"
                          disabled={reviewingId === row.key}
                          onClick={() => handleReviewJoin(row.join!.id, "rejected")}
                          className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          <X size={12} className="inline" aria-hidden="true" /> Reject
                        </button>
                      </>
                    )}
                    {row.areaRequest && (
                      <>
                        <button
                          type="button"
                          disabled={reviewingId === row.key}
                          onClick={() => handleReviewArea(row.areaRequest!.id, "approved", row.areaRequest!)}
                          className="rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                        >
                          {reviewingId === row.key ? "..." : <><Check size={12} className="inline" aria-hidden="true" /> Approve</>}
                        </button>
                        <button
                          type="button"
                          disabled={reviewingId === row.key}
                          onClick={() => handleReviewArea(row.areaRequest!.id, "rejected", row.areaRequest!)}
                          className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          <X size={12} className="inline" aria-hidden="true" /> Reject
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
                          {reviewingId === row.key ? "..." : <><Check size={12} className="inline" aria-hidden="true" /> Approve</>}
                        </button>
                        <button
                          type="button"
                          disabled={reviewingId === row.key}
                          onClick={() => handleReviewTransfer(row.transferId!, "cancelled")}
                          className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          <X size={12} className="inline" aria-hidden="true" /> Reject
                        </button>
                      </>
                    )}
                    {row.property && (
                      <>
                        <button
                          type="button"
                          disabled={reviewingId === row.key}
                          onClick={() => handleReviewProperty(row.property!.id, "approved")}
                          className="rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                        >
                          {reviewingId === row.key ? "..." : <><Check size={12} className="inline" aria-hidden="true" /> Approve</>}
                        </button>
                        <button
                          type="button"
                          disabled={reviewingId === row.key}
                          onClick={() => handleReviewProperty(row.property!.id, "rejected")}
                          className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          <X size={12} className="inline" aria-hidden="true" /> Reject
                        </button>
                      </>
                    )}
                  </div>
                )}
              </td>
            </tr>
          )}
          renderCard={(row) => (
            <div
              data-request-row={row.key}
              className={`space-y-2 rounded-2xl border bg-white shadow-sm ${"p-4"} ${
                highlightKey === row.key
                  ? "border-ember/40 bg-sand-bright ring-1 ring-inset ring-ember/40"
                  : "border-sand-line"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-bark">{row.title}</p>
                  <p className="mt-0.5 truncate text-xs text-moss">{row.contact}</p>
                </div>
                <span className={`inline-block shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${KIND_META[row.kind].badge}`}>
                  {KIND_META[row.kind].label}
                </span>
              </div>
              <p className="line-clamp-3 text-xs text-moss-mid">{row.summary}</p>
              {row.meta && <p className="truncate text-xs text-moss">{row.meta}</p>}
              <div className="flex items-center justify-between gap-2 border-t border-sand-soft pt-2">
                <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusPillClass(row.status)}`}>
                  {row.statusLabel}
                </span>
                <span className="text-[11px] text-moss">{formatDate(row.created_at)}</span>
              </div>
              {row.reviewable && isElder && (
                <div className="flex gap-2">
                  {row.join && (
                    <>
                      <button
                        type="button"
                        disabled={reviewingId === row.key}
                        onClick={() => handleReviewJoin(row.join!.id, "approved")}
                        className="flex-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                      >
                        {reviewingId === row.key ? "..." : <><Check size={12} className="inline" aria-hidden="true" /> Approve</>}
                      </button>
                      <button
                        type="button"
                        disabled={reviewingId === row.key}
                        onClick={() => handleReviewJoin(row.join!.id, "rejected")}
                        className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        <X size={12} className="inline" aria-hidden="true" /> Reject
                      </button>
                    </>
                  )}
                  {row.areaRequest && (
                    <>
                      <button
                        type="button"
                        disabled={reviewingId === row.key}
                        onClick={() => handleReviewArea(row.areaRequest!.id, "approved", row.areaRequest!)}
                        className="flex-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                      >
                        {reviewingId === row.key ? "..." : <><Check size={12} className="inline" aria-hidden="true" /> Approve</>}
                      </button>
                      <button
                        type="button"
                        disabled={reviewingId === row.key}
                        onClick={() => handleReviewArea(row.areaRequest!.id, "rejected", row.areaRequest!)}
                        className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        <X size={12} className="inline" aria-hidden="true" /> Reject
                      </button>
                    </>
                  )}
                  {row.transferId && (
                    <>
                      <button
                        type="button"
                        disabled={reviewingId === row.key}
                        onClick={() => handleReviewTransfer(row.transferId!, "approved")}
                        className="flex-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                      >
                        {reviewingId === row.key ? "..." : <><Check size={12} className="inline" aria-hidden="true" /> Approve</>}
                      </button>
                      <button
                        type="button"
                        disabled={reviewingId === row.key}
                        onClick={() => handleReviewTransfer(row.transferId!, "cancelled")}
                        className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        <X size={12} className="inline" aria-hidden="true" /> Reject
                      </button>
                    </>
                  )}
                  {row.property && (
                    <>
                      <button
                        type="button"
                        disabled={reviewingId === row.key}
                        onClick={() => handleReviewProperty(row.property!.id, "approved")}
                        className="flex-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                      >
                        {reviewingId === row.key ? "..." : <><Check size={12} className="inline" aria-hidden="true" /> Approve</>}
                      </button>
                      <button
                        type="button"
                        disabled={reviewingId === row.key}
                        onClick={() => handleReviewProperty(row.property!.id, "rejected")}
                        className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        <X size={12} className="inline" aria-hidden="true" /> Reject
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        />

      {/* Still verifying their email — a hint the old joins tab carried. */}
      {!loading && joinRequests.some((j) => j.status === "verification_pending") && (activeTab === "all" || activeTab === "join") && (
        <p className="rounded-2xl bg-sand p-4 text-xs italic text-moss-mid">
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
