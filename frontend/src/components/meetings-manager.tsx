"use client";

import { useEffect, useState } from "react";
import {
  Armchair,
  Briefcase,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Mail,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { dayFirst } from "@/lib/dates";
import { BackToOverviewArrow } from "@/components/back-to-overview-arrow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type MeetingKind = "board" | "business";

export interface AgendaItem {
  id?: number;
  title: string;
  description: string;
  order: number;
  document_url?: string | null;
  document_name?: string;
  document?: string | null;
  file?: File | null;
}

export interface UnifiedMeeting {
  id: number;
  kind: MeetingKind;
  title: string;
  meeting_date: string;
  time_display?: string;
  start_time?: string | null;
  end_time?: string | null;
  meeting_time?: string;
  location: string;
  agenda?: string;
  minutes?: string;
  status: "upcoming" | "completed" | "archived";
  notify_sms?: boolean;
  notify_email?: boolean;
  agendas: AgendaItem[];
  created_at: string;
}

interface RawBoardMeeting {
  id: number;
  title: string;
  meeting_date: string;
  start_time: string | null;
  end_time: string | null;
  time_range: string;
  location: string;
  agenda: string;
  minutes: string;
  status: "upcoming" | "completed" | "archived";
  notify_sms: boolean;
  notify_email: boolean;
  agendas: AgendaItem[];
  created_at: string;
}

interface RawBusinessMeeting {
  id: number;
  title: string;
  meeting_date: string;
  location: string;
  status: "upcoming" | "completed" | "archived";
  minutes: string;
  agendas: AgendaItem[];
  created_at: string;
}

interface MeetingsManagerProps {
  initialKindFilter?: "all" | "board" | "business";
}

export function MeetingsManager({ initialKindFilter = "all" }: MeetingsManagerProps) {
  const [meetings, setMeetings] = useState<UnifiedMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state: "all" | "board" | "business"
  const [kindFilter, setKindFilter] = useState<"all" | "board" | "business">(initialKindFilter);
  const [searchQuery, setSearchQuery] = useState("");

  // Create Meeting Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields for creating a meeting
  const [modalMeetingType, setModalMeetingType] = useState<MeetingKind>("board");
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<"upcoming" | "completed" | "archived">("upcoming");
  const [minutes, setMinutes] = useState("");
  const [notifySms, setNotifySms] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [showInvitationDropdown, setShowInvitationDropdown] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [defaultInvitationMessage, setDefaultInvitationMessage] = useState("");

  // Add Agenda Modal state
  const [isAgendaModalOpen, setIsAgendaModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<UnifiedMeeting | null>(null);
  const [agendaTitle, setAgendaTitle] = useState("");
  const [agendaDescription, setAgendaDescription] = useState("");
  const [agendaOrder, setAgendaOrder] = useState<number>(1);
  const [agendaFile, setAgendaFile] = useState<File | null>(null);
  const [agendaSubmitting, setAgendaSubmitting] = useState(false);
  const [agendaError, setAgendaError] = useState<string | null>(null);

  // Expanded meeting key ("board-1", "business-2")
  const [expandedMeetingKey, setExpandedMeetingKey] = useState<string | null>(null);

  const fetchMeetings = async () => {
    setLoading(true);
    setError(null);
    try {
      const [boardRes, businessRes] = await Promise.all([
        fetch(`${API_URL}/api/members/board-meetings/`),
        fetch(`${API_URL}/api/members/business-meetings/`),
      ]);

      const unified: UnifiedMeeting[] = [];

      if (boardRes.ok) {
        const boardData: RawBoardMeeting[] = await boardRes.json();
        boardData.forEach((bm) => {
          unified.push({
            id: bm.id,
            kind: "board",
            title: bm.title,
            meeting_date: bm.meeting_date,
            time_display: bm.time_range,
            start_time: bm.start_time,
            end_time: bm.end_time,
            location: bm.location || "Board Room / Main Sanctuary",
            agenda: bm.agenda,
            minutes: bm.minutes,
            status: bm.status,
            notify_sms: bm.notify_sms,
            notify_email: bm.notify_email,
            agendas: bm.agendas || [],
            created_at: bm.created_at,
          });
        });
      }

      if (businessRes.ok) {
        const businessData: RawBusinessMeeting[] = await businessRes.json();
        businessData.forEach((bm) => {
          unified.push({
            id: bm.id,
            kind: "business",
            title: bm.title,
            meeting_date: bm.meeting_date,
            time_display: undefined,
            location: bm.location || "Main Sanctuary",
            minutes: bm.minutes,
            status: bm.status,
            agendas: bm.agendas || [],
            created_at: bm.created_at,
          });
        });
      }

      // Sort meetings chronologically (newest first)
      unified.sort((a, b) => {
        const dateA = new Date(a.meeting_date).getTime();
        const dateB = new Date(b.meeting_date).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setMeetings(unified);
    } catch {
      setError("Error connecting to server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchMeetings);
  }, []);

  // Fetch church settings for invitation text
  useEffect(() => {
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const msg = data.meeting_invitation_message;
        if (typeof msg === "string" && msg.trim()) {
          setDefaultInvitationMessage(msg.trim());
          setNotificationMessage(msg.trim());
        }
      })
      .catch(() => {});
  }, []);

  const resetForm = (kind: MeetingKind = "board") => {
    setModalMeetingType(kind);
    setTitle("");
    setMeetingDate("");
    setStartTime("");
    setEndTime("");
    setLocation(kind === "board" ? "Board Room / Main Sanctuary" : "Main Sanctuary");
    setStatus("upcoming");
    setMinutes("");
    setNotifySms(true);
    setNotifyEmail(true);
    setNotificationMessage(defaultInvitationMessage);
    setShowInvitationDropdown(false);
    setFormError(null);
  };

  const openCreateModal = (suggestedKind?: MeetingKind) => {
    const kindToUse = suggestedKind ?? (kindFilter === "business" ? "business" : "board");
    resetForm(kindToUse);
    setIsModalOpen(true);
  };

  const handleMeetingTypeChange = (newKind: MeetingKind) => {
    setModalMeetingType(newKind);
    if (!location || location === "Board Room / Main Sanctuary" || location === "Main Sanctuary") {
      setLocation(newKind === "board" ? "Board Room / Main Sanctuary" : "Main Sanctuary");
    }
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim() || !meetingDate) {
      setFormError("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const headers: Record<string, string> = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      if (modalMeetingType === "board") {
        if (!startTime || !endTime) {
          setFormError("Start and End times are required for board meetings.");
          setSubmitting(false);
          return;
        }

        const payload: Record<string, unknown> = {
          title: title.trim(),
          meeting_date: meetingDate,
          start_time: startTime,
          end_time: endTime,
          location: location.trim() || "Board Room / Main Sanctuary",
          notify_sms: notifySms,
          notify_email: notifyEmail,
        };

        if (notificationMessage && notificationMessage.trim()) {
          payload.notification_message = notificationMessage.trim();
        }

        headers["Content-Type"] = "application/json";
        const res = await fetch(`${API_URL}/api/members/board-meetings/`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          setIsModalOpen(false);
          fetchMeetings();
          showAlert("Board Meeting Scheduled", "The church board meeting was scheduled successfully.", "success");
        } else {
          const errData = await res.json().catch(() => ({}));
          setFormError(errData.detail || errData.error || "Failed to schedule board meeting.");
        }
      } else {
        // Business Meeting
        const formData = new FormData();
        formData.append("title", title.trim());
        formData.append("meeting_date", meetingDate);
        if (startTime) {
          formData.append("meeting_time", startTime);
        }
        formData.append("location", location.trim() || "Main Sanctuary");
        formData.append("status", status);
        if (minutes) {
          formData.append("minutes", minutes);
        }
        formData.append("notify_sms", String(notifySms));
        formData.append("notify_email", String(notifyEmail));

        const res = await fetch(`${API_URL}/api/members/business-meetings/`, {
          method: "POST",
          headers,
          body: formData,
        });

        if (res.ok) {
          setIsModalOpen(false);
          fetchMeetings();
          showAlert("Business Meeting Scheduled", "The business meeting was scheduled successfully.", "success");
        } else {
          const errData = await res.json().catch(() => ({}));
          setFormError(errData.detail || errData.error || "Failed to schedule business meeting.");
        }
      }
    } catch {
      setFormError("Error connecting to server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Agenda Handling
  const openAddAgendaModal = (meeting: UnifiedMeeting) => {
    setSelectedMeeting(meeting);
    setAgendaTitle("");
    setAgendaDescription("");
    setAgendaOrder((meeting.agendas?.length || 0) + 1);
    setAgendaFile(null);
    setAgendaError(null);
    setIsAgendaModalOpen(true);
  };

  const handleAddAgenda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeeting) return;

    if (!agendaTitle.trim()) {
      setAgendaError("Please enter an agenda title.");
      return;
    }

    setAgendaSubmitting(true);
    setAgendaError(null);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const formData = new FormData();
      formData.append("title", agendaTitle.trim());
      formData.append("description", agendaDescription.trim());
      formData.append("order", String(agendaOrder));

      if (agendaFile) {
        formData.append("document", agendaFile);
        formData.append("document_name", agendaFile.name);
      }

      const endpoint =
        selectedMeeting.kind === "board"
          ? `${API_URL}/api/members/board-meetings/${selectedMeeting.id}/agendas/`
          : `${API_URL}/api/members/business-meetings/${selectedMeeting.id}/agendas/`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (res.ok) {
        setIsAgendaModalOpen(false);
        fetchMeetings();
        showAlert("Agenda Added", "Agenda item with document added successfully.", "success");
      } else {
        const errData = await res.json().catch(() => ({}));
        setAgendaError(errData.detail || errData.error || "Failed to add agenda item.");
      }
    } catch {
      setAgendaError("Error connecting to server.");
    } finally {
      setAgendaSubmitting(false);
    }
  };

  const handleDeleteAgenda = async (meeting: UnifiedMeeting, agendaId: number) => {
    if (!confirm("Are you sure you want to delete this agenda item?")) return;
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const endpoint =
        meeting.kind === "board"
          ? `${API_URL}/api/members/board-meetings/agendas/${agendaId}/`
          : `${API_URL}/api/members/business-meetings/agendas/${agendaId}/`;

      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.ok) {
        fetchMeetings();
        showAlert("Agenda Deleted", "Agenda item removed successfully.", "success");
      } else {
        showAlert("Could not delete", "Failed to delete the agenda item.", "error");
      }
    } catch {
      showAlert("Network error", "Could not delete the agenda item. Please try again.", "error");
    }
  };

  // Filtered list
  const filteredMeetings = meetings.filter((m) => {
    if (kindFilter !== "all" && m.kind !== kindFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = m.title.toLowerCase().includes(q);
      const matchLocation = m.location.toLowerCase().includes(q);
      const matchDate = m.meeting_date.includes(q);
      return matchTitle || matchLocation || matchDate;
    }
    return true;
  });

  const boardCount = meetings.filter((m) => m.kind === "board").length;
  const businessCount = meetings.filter((m) => m.kind === "business").length;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sand-line bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <BackToOverviewArrow />
          <div>
            <h2 className="flex items-center gap-2 text-xl font-extrabold text-bark">
              <Calendar size={20} aria-hidden="true" />
              <span>Church Meetings</span>
            </h2>
            <p className="mt-1 text-xs text-moss">
              Schedule church board and business meetings, attach agenda documents, record minutes, and track decisions.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-2 rounded-xl bg-bark px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-bark-900 active:scale-95"
          >
            <Plus size={14} aria-hidden="true" />
            <span>Add a meeting</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Toggle Pills: All | Board Meetings | Business Meetings */}
        <div className="inline-flex rounded-xl border border-sand-line bg-sand p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setKindFilter("all")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              kindFilter === "all"
                ? "bg-white text-bark shadow-xs font-bold"
                : "text-moss hover:text-bark"
            }`}
          >
            <span>All Meetings</span>
            <span className="rounded-full bg-sand-shade px-1.5 py-0.2 text-[10px] text-moss-dark">
              {meetings.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setKindFilter("board")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              kindFilter === "board"
                ? "bg-white text-cyan-900 shadow-xs font-bold"
                : "text-moss hover:text-bark"
            }`}
          >
            <ShieldCheck size={13} aria-hidden="true" />
            <span>Board</span>
            <span className="rounded-full bg-cyan-100/60 px-1.5 py-0.2 text-[10px] text-cyan-900">
              {boardCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setKindFilter("business")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              kindFilter === "business"
                ? "bg-white text-purple-900 shadow-xs font-bold"
                : "text-moss hover:text-bark"
            }`}
          >
            <Briefcase size={13} aria-hidden="true" />
            <span>Business</span>
            <span className="rounded-full bg-purple-100/60 px-1.5 py-0.2 text-[10px] text-purple-900">
              {businessCount}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Search meetings by title or place..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-sand-line bg-white px-3.5 py-1.5 text-xs text-bark outline-none transition placeholder:text-moss focus:border-bark"
          />
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="rounded-2xl border border-sand-line bg-white p-12 text-center text-xs font-semibold text-moss">
          Loading church meetings...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredMeetings.length === 0 && (
        <div className="rounded-2xl border border-dashed border-sand-line bg-white p-12 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sand text-2xl text-ember">
            <Calendar size={26} aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-base font-bold text-bark">
            {kindFilter === "board"
              ? "No church board meetings scheduled yet"
              : kindFilter === "business"
              ? "No church business meetings scheduled yet"
              : "No church meetings scheduled yet"}
          </h3>
          <p className="mt-1 text-xs text-moss">
            Click <span className="font-semibold text-bark">&quot;+ Add a meeting&quot;</span> to schedule a meeting and attach agendas.
          </p>
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-bark px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-bark-900"
          >
            <Plus size={14} aria-hidden="true" />
            <span>Add a meeting</span>
          </button>
        </div>
      )}

      {/* Meetings List */}
      {!loading && !error && filteredMeetings.length > 0 && (
        <div className="space-y-4">
          {filteredMeetings.map((meeting) => {
            const meetingKey = `${meeting.kind}-${meeting.id}`;
            const isExpanded = expandedMeetingKey === meetingKey;
            const isBoard = meeting.kind === "board";

            return (
              <div
                key={meetingKey}
                className="overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm transition hover:border-ember/50"
              >
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Meeting Type Badge */}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isBoard
                              ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                              : "border-purple-200 bg-purple-50 text-purple-800"
                          }`}
                        >
                          {isBoard ? (
                            <>
                              <ShieldCheck size={11} aria-hidden="true" />
                              <span>Board Meeting</span>
                            </>
                          ) : (
                            <>
                              <Briefcase size={11} aria-hidden="true" />
                              <span>Business Meeting</span>
                            </>
                          )}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            meeting.status === "upcoming"
                              ? "border-amber-300 bg-amber-100 text-amber-800"
                              : meeting.status === "completed"
                              ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                              : "border-gray-300 bg-gray-100 text-gray-700"
                          }`}
                        >
                          {meeting.status}
                        </span>

                        <h3 className="text-base font-extrabold text-bark">{meeting.title}</h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-moss">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays size={13} aria-hidden="true" />
                          <span>{dayFirst(meeting.meeting_date)}</span>
                        </div>
                        {meeting.time_display && (
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-bark">{meeting.time_display}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <MapPin size={13} aria-hidden="true" />
                          <span>{meeting.location}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ClipboardList size={13} aria-hidden="true" />
                          <span>{meeting.agendas?.length || 0} Agendas</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isBoard && (
                        <a
                          href={`${API_URL}/api/members/business-meetings/${meeting.id}/pdf/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sand-line bg-white px-3 py-1.5 text-xs font-bold text-bark shadow-xs transition hover:bg-sand"
                        >
                          <FileText size={13} aria-hidden="true" />
                          <span>PDF Packet</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => openAddAgendaModal(meeting)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-ember px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-ember-dark"
                      >
                        <Plus size={14} aria-hidden="true" />
                        <span>Add Agenda</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedMeetingKey(isExpanded ? null : meetingKey)}
                        className="rounded-lg border border-sand-line bg-sand px-3 py-1.5 text-xs font-bold text-bark transition hover:bg-sand-shade"
                      >
                        {isExpanded ? (
                          <>
                            Hide Agendas &amp; Minutes{" "}
                            <ChevronUp size={12} className="inline" aria-hidden="true" />
                          </>
                        ) : (
                          <>
                            View Agendas &amp; Minutes{" "}
                            <ChevronDown size={12} className="inline" aria-hidden="true" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content: Agendas & Minutes */}
                  {isExpanded && (
                    <div className="mt-6 space-y-6 border-t border-sand-line pt-6">
                      {/* Agendas Section */}
                      <div>
                        <div className="flex items-center justify-between pb-2">
                          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-bark">
                            <ClipboardList size={14} aria-hidden="true" />
                            <span>Meeting Agendas</span>
                          </h4>
                          <button
                            type="button"
                            onClick={() => openAddAgendaModal(meeting)}
                            className="text-xs font-bold text-ember hover:underline"
                          >
                            + Add Agenda Item
                          </button>
                        </div>

                        {meeting.agendas && meeting.agendas.length > 0 ? (
                          <div className="divide-y divide-sand-line rounded-xl border border-sand-line bg-sand">
                            {meeting.agendas.map((agenda, idx) => (
                              <div
                                key={agenda.id || idx}
                                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-bark">
                                      {agenda.order || idx + 1}
                                    </span>
                                    <h5 className="text-xs font-bold text-bark">{agenda.title}</h5>
                                  </div>
                                  {agenda.description && (
                                    <p className="pl-7 text-xs text-moss">{agenda.description}</p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 pl-7 sm:pl-0">
                                  {agenda.document_url && (
                                    <a
                                      href={agenda.document_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded-md border border-sand-mute bg-white px-2.5 py-1 text-[11px] font-bold text-bark hover:border-bark"
                                    >
                                      <FileText size={12} aria-hidden="true" />
                                      <span>Document</span>
                                    </a>
                                  )}
                                  {agenda.id && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAgenda(meeting, agenda.id!)}
                                      className="rounded-md p-1 text-moss hover:bg-white hover:text-red-600 transition"
                                      title="Delete agenda item"
                                    >
                                      <Trash2 size={13} aria-hidden="true" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-xl border border-sand-line bg-sand p-4 text-xs italic text-moss">
                            No agendas added yet. Use the &quot;+ Add Agenda&quot; button above to attach discussion items.
                          </p>
                        )}
                      </div>

                      {/* Minutes Section */}
                      <div>
                        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-bark pb-2">
                          <FileText size={14} aria-hidden="true" />
                          <span>Meeting Minutes &amp; Notes</span>
                        </h4>
                        {meeting.minutes ? (
                          <div className="whitespace-pre-wrap rounded-xl border border-sand-line bg-sand p-4 text-xs font-medium text-bark leading-relaxed">
                            {meeting.minutes}
                          </div>
                        ) : (
                          <p className="rounded-xl border border-sand-line bg-sand p-4 text-xs italic text-moss">
                            Minutes have not been recorded or uploaded yet.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Meeting */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-sand-line bg-white p-6 shadow-2xl scrollbar-thin">
            <div className="flex items-center justify-between border-b border-sand-line pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-bark">Schedule a Meeting</h3>
                <p className="text-xs text-moss">
                  Select the meeting type and configure meeting details, schedule, and automatic notices.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-1.5 text-moss transition hover:bg-sand hover:text-bark"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateMeeting} className="mt-5 space-y-5">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                  {formError}
                </div>
              )}

              {/* ── Meeting Type Selector ── */}
              <div>
                <label className="block text-xs font-bold text-bark">
                  Meeting Type <span className="text-red-500">*</span>
                </label>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Board Meeting Option */}
                  <button
                    type="button"
                    onClick={() => handleMeetingTypeChange("board")}
                    className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                      modalMeetingType === "board"
                        ? "border-cyan-600 bg-cyan-50/70 shadow-xs"
                        : "border-sand-line bg-sand hover:border-sand-mute"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        modalMeetingType === "board"
                          ? "bg-cyan-600 text-white"
                          : "bg-white text-moss"
                      }`}
                    >
                      <Armchair size={18} aria-hidden="true" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-bark">Board Meeting</span>
                        {modalMeetingType === "board" && (
                          <span className="rounded-full bg-cyan-600 px-1.5 py-0.2 text-[9px] font-extrabold text-white">
                            Selected
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-moss">
                        Executive committee &amp; board members. Agendas, documents, and board minutes.
                      </p>
                    </div>
                  </button>

                  {/* Business Meeting Option */}
                  <button
                    type="button"
                    onClick={() => handleMeetingTypeChange("business")}
                    className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                      modalMeetingType === "business"
                        ? "border-purple-600 bg-purple-50/70 shadow-xs"
                        : "border-sand-line bg-sand hover:border-sand-mute"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        modalMeetingType === "business"
                          ? "bg-purple-600 text-white"
                          : "bg-white text-moss"
                      }`}
                    >
                      <Briefcase size={18} aria-hidden="true" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-bark">Business Meeting</span>
                        {modalMeetingType === "business" && (
                          <span className="rounded-full bg-purple-600 px-1.5 py-0.2 text-[9px] font-extrabold text-white">
                            Selected
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-moss">
                        General church congregation in session. Agendas, PDF packet, and church votes.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Meeting Details */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-bark">
                    Meeting Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      modalMeetingType === "board"
                        ? "e.g. Q3 Executive Board Meeting"
                        : "e.g. Q3 General Church Business Meeting"
                    }
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3.5 py-2.5 text-xs font-medium text-bark outline-none transition focus:border-bark"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-bark">
                    Meeting Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3.5 py-2.5 text-xs font-medium text-bark outline-none transition focus:border-bark"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-bark">Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={
                      modalMeetingType === "board"
                        ? "e.g. Board Room / Main Sanctuary"
                        : "e.g. Main Sanctuary"
                    }
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3.5 py-2.5 text-xs font-medium text-bark outline-none transition focus:border-bark"
                  />
                </div>

                {/* Timing */}
                <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                  <div>
                    <label className="block text-xs font-bold text-bark">
                      Start Time {modalMeetingType === "board" && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="time"
                      required={modalMeetingType === "board"}
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-2.5 py-2 text-xs outline-none focus:border-bark"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-bark">
                      End Time {modalMeetingType === "board" && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="time"
                      required={modalMeetingType === "board"}
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-2.5 py-2 text-xs outline-none focus:border-bark"
                    />
                  </div>
                </div>

                {modalMeetingType === "business" && (
                  <div>
                    <label className="block text-xs font-bold text-bark">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as "upcoming" | "completed" | "archived")}
                      className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3.5 py-2.5 text-xs font-medium text-bark outline-none transition focus:border-bark"
                    >
                      <option value="upcoming">Upcoming</option>
                      <option value="completed">Completed</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Automatic Notifications Dropdown */}
              <div className="relative">
                <label className="block text-xs font-bold text-bark">Invitation Method</label>
                <div className="relative mt-1">
                  <button
                    type="button"
                    onClick={() => setShowInvitationDropdown((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-xl border border-sand-line bg-sand px-3.5 py-2.5 text-xs font-medium text-bark outline-none transition hover:border-ember focus:border-bark"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Mail size={14} aria-hidden="true" />
                      <span className="font-semibold text-bark">
                        {notifySms && notifyEmail
                          ? "SMS & Email Notifications"
                          : notifySms
                          ? "SMS Notification Only"
                          : notifyEmail
                          ? "Email Notification Only"
                          : "None (No automatic invitations)"}
                      </span>
                    </div>
                    <ChevronDown size={12} className="text-moss" aria-hidden="true" />
                  </button>

                  {showInvitationDropdown && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border border-sand-line bg-white p-4 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-ember">
                        {modalMeetingType === "board"
                          ? "Automatic Board Member Invitation Channels"
                          : "Automatic Member Invitation Channels"}
                      </div>
                      <div className="space-y-2.5">
                        <label className="flex items-center gap-2.5 rounded-xl p-2 cursor-pointer hover:bg-sand transition text-xs font-semibold text-bark">
                          <input
                            type="checkbox"
                            checked={notifySms}
                            onChange={(e) => setNotifySms(e.target.checked)}
                            className="h-4 w-4 rounded border-sand-line text-ember focus:ring-ember"
                          />
                          <div>
                            <div>SMS Text Messages</div>
                            <div className="text-[10px] text-moss">
                              {modalMeetingType === "board"
                                ? "Notify board members via phone SMS"
                                : "Notify church members via phone SMS"}
                            </div>
                          </div>
                        </label>

                        <label className="flex items-center gap-2.5 rounded-xl p-2 cursor-pointer hover:bg-sand transition text-xs font-semibold text-bark">
                          <input
                            type="checkbox"
                            checked={notifyEmail}
                            onChange={(e) => setNotifyEmail(e.target.checked)}
                            className="h-4 w-4 rounded border-sand-line text-ember focus:ring-ember"
                          />
                          <div>
                            <div>Email Invitations</div>
                            <div className="text-[10px] text-moss">
                              Send meeting notifications and calendar invites via email
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-sand-line pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-sand-line bg-white px-4 py-2.5 text-xs font-bold text-bark transition hover:bg-sand"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-bark px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-bark-900 disabled:opacity-50"
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>
                    {submitting
                      ? "Scheduling..."
                      : modalMeetingType === "board"
                      ? "Schedule Board Meeting"
                      : "Schedule Business Meeting"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Agenda Item */}
      {isAgendaModalOpen && selectedMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-sand-line bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-sand-line pb-4">
              <div>
                <h3 className="text-base font-extrabold text-bark">Add Agenda Item</h3>
                <p className="text-xs text-moss">
                  Add an item to &quot;{selectedMeeting.title}&quot;
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAgendaModalOpen(false)}
                className="rounded-full p-1.5 text-moss transition hover:bg-sand hover:text-bark"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleAddAgenda} className="mt-5 space-y-4">
              {agendaError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                  {agendaError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-bark">
                  Agenda Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={agendaTitle}
                  onChange={(e) => setAgendaTitle(e.target.value)}
                  placeholder="e.g. Budget Review & Financial Report"
                  className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3.5 py-2.5 text-xs font-medium text-bark outline-none transition focus:border-bark"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-bark">Description / Discussion Scope</label>
                <textarea
                  rows={3}
                  value={agendaDescription}
                  onChange={(e) => setAgendaDescription(e.target.value)}
                  placeholder="Brief details or scope of this agenda item..."
                  className="mt-1 w-full rounded-xl border border-sand-line bg-sand p-3 text-xs font-medium text-bark outline-none transition focus:border-bark"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-bark">Agenda Order</label>
                  <input
                    type="number"
                    min={1}
                    value={agendaOrder}
                    onChange={(e) => setAgendaOrder(parseInt(e.target.value) || 1)}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3.5 py-2.5 text-xs font-medium text-bark outline-none transition focus:border-bark"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-bark">Supporting File (Optional)</label>
                  <input
                    type="file"
                    onChange={(e) => setAgendaFile(e.target.files ? e.target.files[0] : null)}
                    className="mt-1 w-full text-xs text-moss file:mr-2 file:rounded-lg file:border-0 file:bg-bark file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-bark-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-sand-line pt-4">
                <button
                  type="button"
                  onClick={() => setIsAgendaModalOpen(false)}
                  className="rounded-xl border border-sand-line bg-white px-4 py-2.5 text-xs font-bold text-bark transition hover:bg-sand"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={agendaSubmitting}
                  className="rounded-xl bg-ember px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-ember-dark disabled:opacity-50"
                >
                  {agendaSubmitting ? "Adding Agenda..." : "Add Agenda Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
