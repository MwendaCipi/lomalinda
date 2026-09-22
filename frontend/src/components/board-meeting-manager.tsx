"use client";

import { useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";

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

interface BoardMeeting {
  id: number;
  title: string;
  meeting_date: string;
  meeting_time: string;
  location: string;
  agenda: string;
  minutes: string;
  status: "upcoming" | "completed" | "archived";
  reference_file?: string | null;
  reference_file_url?: string | null;
  notify_sms: boolean;
  notify_email: boolean;
  agendas: AgendaItem[];
  created_at: string;
}

export function BoardMeetingManager() {
  const [meetings, setMeetings] = useState<BoardMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Meeting Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields for creating a board meeting
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("5:00 PM");
  const [location, setLocation] = useState("Board Room / Main Sanctuary");
  const [status, setStatus] = useState<"upcoming" | "completed" | "archived">("upcoming");
  const [minutes, setMinutes] = useState("");
  const [notifySms, setNotifySms] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [showInvitationDropdown, setShowInvitationDropdown] = useState(false);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [agendas, setAgendas] = useState<AgendaItem[]>([]);

  // Add Agenda Modal state for an existing meeting
  const [isAgendaModalOpen, setIsAgendaModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<BoardMeeting | null>(null);
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
      const res = await fetch(`${API_URL}/api/members/board-meetings/`);
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
      } else {
        setError("Failed to load board meetings.");
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

  const handleAddAgendaRow = () => {
    setAgendas((prev) => [
      ...prev,
      { title: "", description: "", order: prev.length + 1, file: null },
    ]);
  };

  const handleRemoveAgendaRow = (index: number) => {
    setAgendas((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAgendaChange = (index: number, field: keyof AgendaItem, value: any) => {
    setAgendas((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const resetForm = () => {
    setTitle("");
    setMeetingDate("");
    setMeetingTime("5:00 PM");
    setLocation("Board Room / Main Sanctuary");
    setStatus("upcoming");
    setMinutes("");
    setNotifySms(true);
    setNotifyEmail(true);
    setReferenceFile(null);
    setAgendas([]);
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
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const formData = new FormData();
      formData.append("title", title);
      formData.append("meeting_date", meetingDate);
      formData.append("meeting_time", meetingTime);
      formData.append("location", location);
      formData.append("status", status);
      formData.append("minutes", minutes);
      formData.append("notify_sms", notifySms ? "true" : "false");
      formData.append("notify_email", notifyEmail ? "true" : "false");

      if (referenceFile) {
        formData.append("reference_file", referenceFile);
      }

      const agendaPayload = agendas.map((a, idx) => ({
        title: a.title,
        description: a.description,
        order: a.order || idx + 1,
      }));
      formData.append("agendas", JSON.stringify(agendaPayload));

      agendas.forEach((a, idx) => {
        if (a.file) {
          formData.append(`agenda_file_${idx}`, a.file);
        }
      });

      const res = await fetch(`${API_URL}/api/members/board-meetings/`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (res.ok) {
        setIsModalOpen(false);
        resetForm();
        fetchMeetings();
        showAlert(
          "Board Meeting Scheduled",
          `Board Meeting successfully created.${notifySms || notifyEmail ? " Notifications dispatched to church board members." : ""}`,
          "success"
        );
      } else {
        const errData = await res.json().catch(() => ({}));
        setFormError(errData.detail || errData.error || "Failed to schedule board meeting.");
      }
    } catch {
      setFormError("Error connecting to server.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAddAgendaModal = (meeting: BoardMeeting) => {
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
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const formData = new FormData();
      formData.append("title", agendaTitle);
      formData.append("description", agendaDescription);
      formData.append("order", String(agendaOrder));
      if (agendaFile) {
        formData.append("document", agendaFile);
      }

      const res = await fetch(`${API_URL}/api/members/board-meetings/${selectedMeeting.id}/agendas/`, {
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

  const handleDeleteAgenda = async (agendaId: number) => {
    if (!confirm("Are you sure you want to delete this agenda item?")) return;
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const res = await fetch(`${API_URL}/api/members/board-meetings/agendas/${agendaId}/`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        fetchMeetings();
      } else {
        showAlert("Could not delete", "Failed to delete the agenda item.", "error");
      }
    } catch {
      showAlert("Network error", "Could not delete the agenda item. Please try again.", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-extrabold text-[#26352f] flex items-center gap-2">
            <span>🛡️</span> Church Board Meetings
          </h2>
          <p className="mt-1 text-xs text-[#617068]">
            Schedule church board meetings, attach agenda documents, record minutes, and notify board members.
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
          <span>Schedule Board Meeting</span>
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="rounded-2xl border border-[#dfdbd1] bg-white p-12 text-center text-xs font-semibold text-[#617068]">
          Loading board meetings...
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
            🛡️
          </div>
          <h3 className="mt-4 text-base font-bold text-[#26352f]">No church board meetings scheduled yet</h3>
          <p className="mt-1 text-xs text-[#617068]">
            Click <span className="font-semibold text-[#26352f]">&quot;+ Schedule Board Meeting&quot;</span> to schedule a new meeting and attach agendas.
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
            <span>Schedule Board Meeting</span>
          </button>
        </div>
      )}

      {/* Meetings List */}
      {!loading && !error && meetings.length > 0 && (
        <div className="space-y-4">
          {meetings.map((m) => {
            const isExpanded = expandedMeetingId === m.id;
            return (
              <div
                key={m.id}
                className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm transition hover:border-[#b36b3c]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          m.status === "upcoming"
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : m.status === "completed"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : "bg-gray-100 text-gray-700 border border-gray-300"
                        }`}
                      >
                        {m.status}
                      </span>
                      <h3 className="text-base font-bold text-[#26352f]">{m.title}</h3>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[#617068]">
                      <span>📅 <strong>Date:</strong> {m.meeting_date}</span>
                      <span>⏰ <strong>Time:</strong> {m.meeting_time}</span>
                      <span>📍 <strong>Location:</strong> {m.location}</span>
                      <span>📑 <strong>Agendas:</strong> {m.agendas?.length || 0}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenAddAgendaModal(m)}
                      className="rounded-xl border border-[#b36b3c] bg-white px-3 py-1.5 text-xs font-semibold text-[#b36b3c] hover:bg-[#faf7f2]"
                    >
                      + Add Agenda
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedMeetingId(isExpanded ? null : m.id)}
                      className="rounded-xl bg-[#f7f4ee] px-3.5 py-1.5 text-xs font-semibold text-[#26352f] hover:bg-[#dfdbd1]"
                    >
                      {isExpanded ? "Hide Details" : "View Details & Agendas"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-5 pt-5 border-t border-[#dfdbd1] space-y-4">
                    {m.agenda && (
                      <div>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#617068]">
                          Meeting Overview / Summary
                        </h4>
                        <p className="mt-1 text-xs leading-relaxed text-[#26352f] whitespace-pre-line">
                          {m.agenda}
                        </p>
                      </div>
                    )}

                    {m.reference_file_url && (
                      <div>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#617068]">
                          Main Board Document
                        </h4>
                        <a
                          href={m.reference_file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-[#b36b3c] hover:underline"
                        >
                          📎 Download Board Material Reference File &rarr;
                        </a>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#617068]">
                          Board Agendas ({m.agendas?.length || 0})
                        </h4>
                      </div>

                      {(!m.agendas || m.agendas.length === 0) ? (
                        <p className="text-xs italic text-[#617068]">No individual agenda items added yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {m.agendas.map((ag) => (
                            <div
                              key={ag.id}
                              className="flex items-start justify-between rounded-xl border border-[#dfdbd1] bg-[#f7f4ee]/70 p-3"
                            >
                              <div>
                                <p className="text-xs font-bold text-[#26352f]">
                                  {ag.order}. {ag.title}
                                </p>
                                {ag.description && (
                                  <p className="mt-1 text-xs text-[#617068]">{ag.description}</p>
                                )}
                                {ag.document_url && (
                                  <a
                                    href={ag.document_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#b36b3c] hover:underline"
                                  >
                                    📄 {ag.document_name || "Download Attached Agenda Document"}
                                  </a>
                                )}
                              </div>
                              {ag.id && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAgenda(ag.id!)}
                                  className="text-[11px] font-bold text-red-600 hover:underline"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {m.minutes && (
                      <div className="rounded-xl border border-[#dfdbd1] bg-[#faf7f2] p-4">
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#b36b3c]">
                          Recorded Board Minutes
                        </h4>
                        <p className="mt-2 text-xs leading-relaxed text-[#26352f] whitespace-pre-line">
                          {m.minutes}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Schedule Board Meeting Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="my-8 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4">
              <div>
                <h3 className="text-xl font-bold text-[#26352f]">Schedule Church Board Meeting</h3>
                <p className="mt-1 text-xs text-[#617068]">
                  Fill in meeting details, agendas with documents, and invitation preferences.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateMeeting} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#26352f]">Board Meeting Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q3 Executive Board Meeting"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-4 py-2 text-xs font-semibold outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-[#26352f]">Meeting Date *</label>
                  <input
                    type="date"
                    required
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3 py-2 text-xs outline-none focus:border-[#b36b3c]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26352f]">Meeting Time</label>
                  <input
                    type="text"
                    placeholder="e.g. 5:00 PM"
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3 py-2 text-xs outline-none focus:border-[#b36b3c]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26352f]">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3 py-2 text-xs outline-none focus:border-[#b36b3c]"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26352f]">Location</label>
                <input
                  type="text"
                  placeholder="e.g. Board Room / Main Sanctuary"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-4 py-2 text-xs outline-none focus:border-[#b36b3c]"
                />
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
                    className="flex w-full items-center justify-between rounded-xl border border-[#c9c5bb] bg-white px-4 py-2 text-xs font-medium text-[#26352f] outline-none transition hover:border-[#b36b3c] focus:border-[#b36b3c]"
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
                        Automatic Board Member Invitation Channels
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
                            <div className="text-[10px] font-normal text-[#617068]">Send SMS invitation to all church board members</div>
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
                            <div className="text-[10px] font-normal text-[#617068]">Send Email invitation to all church board members</div>
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

              {/* Notification Message */}
              <div>
                <label className="block text-xs font-bold text-[#26352f]">Notification Message</label>
                <textarea
                  rows={2}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="Optional custom message to include in board member invitations..."
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-4 py-2 text-xs outline-none focus:border-[#b36b3c]"
                />
              </div>

              {/* Main Board Reference File */}
              <div>
                <label className="block text-xs font-bold text-[#26352f]">
                  Main Board Reference Document (Optional)
                </label>
                <input
                  type="file"
                  onChange={(e) => setReferenceFile(e.target.files?.[0] || null)}
                  className="mt-1 w-full text-xs text-[#617068] file:mr-3 file:rounded-xl file:border-0 file:bg-[#f7f4ee] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-[#26352f] hover:file:bg-[#dfdbd1]"
                />
              </div>

              {/* Agendas List Builder */}
              <div className="border-t border-[#dfdbd1] pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#26352f]">
                    Agenda Items &amp; Document Attachments
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddAgendaRow}
                    className="rounded-lg bg-[#26352f] px-3 py-1 text-xs font-bold text-white hover:bg-[#1b2622]"
                  >
                    + Add Agenda Item
                  </button>
                </div>

                {agendas.length === 0 ? (
                  <p className="text-xs italic text-[#617068]">
                    No agenda items added yet. Click &quot;+ Add Agenda Item&quot; to attach documents per agenda.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {agendas.map((ag, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-[#dfdbd1] bg-[#f7f4ee]/70 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#b36b3c]">Item #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAgendaRow(idx)}
                            className="text-xs font-bold text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                        <input
                          type="text"
                          required
                          placeholder="Agenda Item Title *"
                          value={ag.title}
                          onChange={(e) => handleAgendaChange(idx, "title", e.target.value)}
                          className="w-full rounded-lg border border-[#c9c5bb] px-3 py-1.5 text-xs outline-none focus:border-[#b36b3c]"
                        />
                        <textarea
                          rows={2}
                          placeholder="Description / Notes (Optional)"
                          value={ag.description}
                          onChange={(e) => handleAgendaChange(idx, "description", e.target.value)}
                          className="w-full rounded-lg border border-[#c9c5bb] px-3 py-1.5 text-xs outline-none focus:border-[#b36b3c]"
                        />
                        <div>
                          <label className="block text-[11px] font-semibold text-[#617068]">
                            Attach Document File (PDF / Word / Doc)
                          </label>
                          <input
                            type="file"
                            onChange={(e) => handleAgendaChange(idx, "file", e.target.files?.[0] || null)}
                            className="mt-1 w-full text-xs text-[#617068] file:mr-2 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[#26352f]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full border border-[#c9c5bb] px-5 py-2 text-xs font-semibold text-[#26352f] hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-[#b36b3c] px-6 py-2 text-xs font-bold text-white hover:bg-[#96552e] disabled:opacity-50"
                >
                  {submitting ? "Scheduling & Sending Invites..." : "Schedule Board Meeting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Single Agenda Item Modal */}
      {isAgendaModalOpen && selectedMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <h3 className="text-base font-bold text-[#26352f]">Add Agenda to Board Meeting</h3>
              <button
                type="button"
                onClick={() => setIsAgendaModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {agendaError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {agendaError}
              </div>
            )}

            <form onSubmit={handleAddAgendaToMeeting} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#26352f]">Agenda Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Financial Report Review"
                  value={agendaTitle}
                  onChange={(e) => setAgendaTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2 text-xs outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26352f]">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Details regarding this agenda..."
                  value={agendaDescription}
                  onChange={(e) => setAgendaDescription(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2 text-xs outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26352f]">Agenda Document File</label>
                <input
                  type="file"
                  onChange={(e) => setAgendaFile(e.target.files?.[0] || null)}
                  className="mt-1 w-full text-xs text-[#617068] file:mr-2 file:rounded-xl file:border-0 file:bg-[#f7f4ee] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#26352f]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-3">
                <button
                  type="button"
                  onClick={() => setIsAgendaModalOpen(false)}
                  className="rounded-full border border-[#c9c5bb] px-4 py-1.5 text-xs font-semibold text-[#26352f]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={agendaSubmitting}
                  className="rounded-full bg-[#b36b3c] px-5 py-1.5 text-xs font-bold text-white hover:bg-[#96552e] disabled:opacity-50"
                >
                  {agendaSubmitting ? "Uploading..." : "Save Agenda Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
