"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface AgendaItem {
  id?: number;
  title: string;
  description: string;
  order: number;
  document_url?: string | null;
  document_name?: string;
  document?: string | null;
  file?: File | null;
}

interface BusinessMeeting {
  id: number;
  title: string;
  meeting_date: string;
  location: string;
  status: "upcoming" | "completed" | "archived";
  minutes: string;
  agendas: AgendaItem[];
  created_at: string;
}

export function BusinessMeetingManager() {
  const [meetings, setMeetings] = useState<BusinessMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Meeting Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields for creating a meeting
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [location, setLocation] = useState("Main Sanctuary");
  const [status, setStatus] = useState<"upcoming" | "completed" | "archived">("upcoming");
  const [minutes, setMinutes] = useState("");
  const [notifySms, setNotifySms] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [showInvitationDropdown, setShowInvitationDropdown] = useState(false);

  // Add Agenda Modal state for an existing meeting
  const [isAgendaModalOpen, setIsAgendaModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<BusinessMeeting | null>(null);
  const [agendaTitle, setAgendaTitle] = useState("");
  const [agendaDescription, setAgendaDescription] = useState("");
  const [agendaOrder, setAgendaOrder] = useState<number>(1);
  const [agendaFile, setAgendaFile] = useState<File | null>(null);
  const [agendaSubmitting, setAgendaSubmitting] = useState(false);
  const [agendaError, setAgendaError] = useState<string | null>(null);

  const [expandedMeetingId, setExpandedMeetingId] = useState<number | null>(null);

  const fetchMeetings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/members/business-meetings/`);
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
      } else {
        setError("Failed to load business meetings.");
      }
    } catch {
      setError("Error connecting to server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const resetForm = () => {
    setTitle("");
    setMeetingDate("");
    setLocation("Main Sanctuary");
    setStatus("upcoming");
    setMinutes("");
    setNotifySms(true);
    setNotifyEmail(true);
    setFormError(null);
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Meeting title is required.");
      return;
    }
    if (!meetingDate) {
      setFormError("Meeting date is required.");
      return;
    }

    setSubmitting(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    const formData = new FormData();
    formData.append("title", title);
    formData.append("meeting_date", meetingDate);
    formData.append("location", location);
    formData.append("status", status);
    formData.append("minutes", minutes);
    formData.append("notify_sms", notifySms ? "true" : "false");
    formData.append("notify_email", notifyEmail ? "true" : "false");

    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/members/business-meetings/`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (res.ok) {
        resetForm();
        setIsModalOpen(false);
        fetchMeetings();
      } else {
        const errData = await res.json().catch(() => null);
        setFormError(errData?.error || "Failed to create business meeting.");
      }
    } catch {
      setFormError("Network error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  // Open modal to add an agenda item to an existing meeting
  const openAddAgendaModal = (meeting: BusinessMeeting) => {
    setSelectedMeeting(meeting);
    setAgendaTitle("");
    setAgendaDescription("");
    setAgendaOrder((meeting.agendas?.length || 0) + 1);
    setAgendaFile(null);
    setAgendaError(null);
    setIsAgendaModalOpen(true);
  };

  const handleAddAgendaToMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeeting) return;
    if (!agendaTitle.trim()) {
      setAgendaError("Agenda title is required.");
      return;
    }

    setAgendaSubmitting(true);
    setAgendaError(null);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    const formData = new FormData();
    formData.append("title", agendaTitle.trim());
    formData.append("description", agendaDescription.trim());
    formData.append("order", String(agendaOrder));
    if (agendaFile) {
      formData.append("file", agendaFile);
    }

    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/members/business-meetings/${selectedMeeting.id}/agendas/`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (res.ok) {
        setIsAgendaModalOpen(false);
        setExpandedMeetingId(selectedMeeting.id);
        fetchMeetings();
      } else {
        const data = await res.json().catch(() => null);
        setAgendaError(data?.error || "Failed to add agenda item.");
      }
    } catch {
      setAgendaError("Network error occurred.");
    } finally {
      setAgendaSubmitting(false);
    }
  };

  const handleDeleteAgenda = async (agendaId: number, meetingId: number) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/members/business-meetings/agendas/${agendaId}/`, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        setExpandedMeetingId(meetingId);
        fetchMeetings();
      }
    } catch {
      // ignore error
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "upcoming":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "completed":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "archived":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-extrabold text-[#26352f]">Business Meetings</h2>
          <p className="mt-1 text-xs text-[#617068]">
            Manage church business meeting schedules, agendas, supporting documents, and recorded minutes.
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
          <span>Add Business Meeting</span>
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="rounded-2xl border border-[#dfdbd1] bg-white p-12 text-center text-xs font-semibold text-[#617068]">
          Loading business meetings...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && meetings.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#dfdbd1] bg-white p-12 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f7f4ee] text-2xl text-[#b36b3c]">
            💼
          </div>
          <h3 className="mt-4 text-base font-bold text-[#26352f]">No business meetings scheduled yet</h3>
          <p className="mt-1 text-xs text-[#617068]">
            Click <span className="font-semibold text-[#26352f]">&quot;+ Add Business Meeting&quot;</span> to schedule a new meeting and attach agendas.
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
            <span>Add Business Meeting</span>
          </button>
        </div>
      )}

      {/* Meetings List */}
      {!loading && !error && meetings.length > 0 && (
        <div className="space-y-4">
          {meetings.map((meeting) => {
            const isExpanded = expandedMeetingId === meeting.id;
            return (
              <div
                key={meeting.id}
                className="overflow-hidden rounded-2xl border border-[#dfdbd1] bg-white shadow-sm transition hover:border-[#b36b3c]/50"
              >
                <div className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-base font-extrabold text-[#26352f]">{meeting.title}</h3>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${getStatusBadge(
                            meeting.status
                          )}`}
                        >
                          {meeting.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-[#617068]">
                        <div className="flex items-center gap-1.5">
                          <span>📅</span>
                          <span>{meeting.meeting_date}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span>📍</span>
                          <span>{meeting.location || "Main Sanctuary"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span>📋</span>
                          <span>{meeting.agendas?.length || 0} Agendas</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`${API_URL}/api/members/business-meetings/${meeting.id}/pdf/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#dfdbd1] bg-white px-3 py-1.5 text-xs font-bold text-[#26352f] shadow-xs transition hover:bg-[#f7f4ee]"
                      >
                        <span>📄</span>
                        <span>PDF Packet</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => openAddAgendaModal(meeting)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#b36b3c] px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#96552e]"
                      >
                        <span>➕</span>
                        <span>Add Agenda</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedMeetingId(isExpanded ? null : meeting.id)}
                        className="rounded-lg border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-1.5 text-xs font-bold text-[#26352f] transition hover:bg-[#eae4d8]"
                      >
                        {isExpanded ? "Hide Agendas & Minutes ▲" : "View Agendas & Minutes ▼"}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-6 space-y-6 border-t border-[#dfdbd1] pt-6">
                      {/* Agendas Section */}
                      <div>
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#b36b3c]">
                            Meeting Agendas
                          </h4>
                          <button
                            type="button"
                            onClick={() => openAddAgendaModal(meeting)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#b36b3c] hover:underline"
                          >
                            <span>➕ Add Agenda Item</span>
                          </button>
                        </div>
                        {meeting.agendas && meeting.agendas.length > 0 ? (
                          <div className="mt-3 space-y-3">
                            {meeting.agendas.map((ag, idx) => (
                              <div
                                key={ag.id || idx}
                                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee]/60 p-4"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#26352f] text-[10px] font-bold text-white">
                                      {ag.order || idx + 1}
                                    </span>
                                    <h5 className="text-xs font-bold text-[#26352f]">{ag.title}</h5>
                                  </div>
                                  {ag.description && (
                                    <p className="text-xs text-[#617068] pl-7">{ag.description}</p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  {(ag.document_url || ag.document) && (
                                    <a
                                      href={ag.document_url || ag.document || "#"}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#dfdbd1] bg-white px-2.5 py-1 text-[11px] font-bold text-[#b36b3c] shadow-xs transition hover:bg-[#f7f4ee]"
                                    >
                                      <span>📎</span>
                                      <span>{ag.document_name || "Download Document"}</span>
                                    </a>
                                  )}
                                  {ag.id && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAgenda(ag.id!, meeting.id)}
                                      title="Delete agenda item"
                                      className="rounded-lg p-1.5 text-xs text-red-600 transition hover:bg-red-50 hover:text-red-700"
                                    >
                                      🗑️
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs italic text-[#617068]">
                            No specific agenda items recorded for this meeting. Click &quot;Add Agenda Item&quot; to add one.
                          </p>
                        )}
                      </div>

                      {/* Minutes Section */}
                      <div>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#b36b3c]">
                          Meeting Minutes / Summary
                        </h4>
                        {meeting.minutes ? (
                          <div className="mt-2 rounded-xl bg-[#f7f4ee] p-4 text-xs leading-relaxed text-[#26352f]">
                            {meeting.minutes}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs italic text-[#617068]">Minutes have not been uploaded yet.</p>
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

      {/* Modal Overlay for Adding Agenda Item to an Existing Meeting */}
      {isAgendaModalOpen && selectedMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-[#dfdbd1] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-[#26352f]">Add Agenda Item</h3>
                <p className="text-xs text-[#617068]">
                  Meeting: <span className="font-semibold text-[#b36b3c]">{selectedMeeting.title}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAgendaModalOpen(false)}
                className="rounded-full p-1.5 text-[#617068] transition hover:bg-[#f7f4ee] hover:text-[#26352f]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAgendaToMeeting} className="mt-5 space-y-4">
              {agendaError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                  {agendaError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#26352f]">
                  Agenda Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={agendaTitle}
                  onChange={(e) => setAgendaTitle(e.target.value)}
                  placeholder="e.g. Q3 Financial Audit Review"
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26352f]">Description / Notes (Optional)</label>
                <textarea
                  rows={3}
                  value={agendaDescription}
                  onChange={(e) => setAgendaDescription(e.target.value)}
                  placeholder="Brief details or scope of this agenda item..."
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] p-3 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-[#26352f]">Agenda Order / Position</label>
                  <input
                    type="number"
                    min={1}
                    value={agendaOrder}
                    onChange={(e) => setAgendaOrder(parseInt(e.target.value) || 1)}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26352f]">Supporting File (Optional)</label>
                  <input
                    type="file"
                    onChange={(e) => setAgendaFile(e.target.files ? e.target.files[0] : null)}
                    className="mt-1 w-full text-xs text-[#617068] file:mr-2 file:rounded-lg file:border-0 file:bg-[#26352f] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-[#1e2a25]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-4">
                <button
                  type="button"
                  onClick={() => setIsAgendaModalOpen(false)}
                  className="rounded-xl border border-[#dfdbd1] bg-white px-4 py-2.5 text-xs font-bold text-[#26352f] transition hover:bg-[#f7f4ee]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={agendaSubmitting}
                  className="rounded-xl bg-[#b36b3c] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#96552e] disabled:opacity-50"
                >
                  {agendaSubmitting ? "Adding Agenda..." : "Add Agenda Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Overlay for Creating Business Meeting */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#dfdbd1] bg-white p-6 shadow-2xl scrollbar-thin">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-[#26352f]">Create Business Meeting</h3>
                <p className="text-xs text-[#617068]">Add meeting details and notification settings. Agendas can be added per meeting row after creation.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-1.5 text-[#617068] transition hover:bg-[#f7f4ee] hover:text-[#26352f]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMeeting} className="mt-6 space-y-5">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                  {formError}
                </div>
              )}

              {/* Meeting Basic Details */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#26352f]">
                    Meeting Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Q3 General Church Business Meeting"
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26352f]">
                    Meeting Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26352f]">Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Main Sanctuary"
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26352f]">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* Invitation Method Combo Box with Checkbox Pop-up */}
              <div className="relative">
                <label className="block text-xs font-bold text-[#26352f]">
                  Invitation Method
                </label>
                <div className="relative mt-1">
                  <button
                    type="button"
                    onClick={() => setShowInvitationDropdown((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2.5 text-xs font-medium text-[#26352f] outline-none transition hover:border-[#b36b3c] focus:border-[#26352f]"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-sm">📩</span>
                      <span className="font-semibold text-[#26352f]">
                        {notifySms && notifyEmail
                          ? "SMS & Email Notifications"
                          : notifySms
                          ? "SMS Notification Only"
                          : notifyEmail
                          ? "Email Notification Only"
                          : "None (No automatic invitations)"}
                      </span>
                    </div>
                    <span className="text-[#617068] text-[10px]">▼</span>
                  </button>

                  {showInvitationDropdown && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-[#b36b3c]">
                        Automatic Member Invitation Channels
                      </div>
                      <div className="space-y-2.5">
                        <label className="flex items-center gap-2.5 rounded-xl p-2.5 cursor-pointer hover:bg-[#f7f4ee] transition text-xs font-semibold text-[#26352f]">
                          <input
                            type="checkbox"
                            checked={notifySms}
                            onChange={(e) => setNotifySms(e.target.checked)}
                            className="h-4 w-4 rounded border-[#c9c5bb] text-[#b36b3c] focus:ring-[#b36b3c]"
                          />
                          <div>
                            <div>SMS Notification</div>
                            <div className="text-[10px] font-normal text-[#617068]">Send SMS invitation to all registered church members</div>
                          </div>
                        </label>

                        <label className="flex items-center gap-2.5 rounded-xl p-2.5 cursor-pointer hover:bg-[#f7f4ee] transition text-xs font-semibold text-[#26352f]">
                          <input
                            type="checkbox"
                            checked={notifyEmail}
                            onChange={(e) => setNotifyEmail(e.target.checked)}
                            className="h-4 w-4 rounded border-[#c9c5bb] text-[#b36b3c] focus:ring-[#b36b3c]"
                          />
                          <div>
                            <div>Email Notification</div>
                            <div className="text-[10px] font-normal text-[#617068]">Send Email invitation to all registered church members</div>
                          </div>
                        </label>
                      </div>

                      <div className="mt-3 flex justify-end border-t border-[#dfdbd1] pt-2">
                        <button
                          type="button"
                          onClick={() => setShowInvitationDropdown(false)}
                          className="rounded-lg bg-[#26352f] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#1e2a25]"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Minutes / Notes */}
              <div>
                <label className="block text-xs font-bold text-[#26352f]">Notification Message</label>
                <textarea
                  rows={2}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="Optional custom message to include in member invitations..."
                  className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] p-3.5 text-xs font-medium text-[#26352f] outline-none transition focus:border-[#26352f]"
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
                  {submitting ? "Saving..." : "Save Business Meeting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
