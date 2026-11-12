"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Paperclip, PenLine, Save, Send, Upload, X } from "lucide-react";

import { showAlert } from "@/lib/alerts";
import { dayFirst } from "@/lib/dates";
import { openPdfTab } from "@/lib/pdf-lightbox";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** The desk's policy as the server keeps it: one page of words, and who last
 *  touched them. */
type Policy = {
  title: string;
  content: string;
  updated_at: string | null;
  updated_by_name: string;
  /** The desk's own paper, where one was uploaded — a PDF or Word document. */
  document_url?: string;
  document_name?: string;
  can_edit: boolean;
};

/** A copy of the policy filed for signatures — a letter, marked as a policy. */
type PolicyCopy = {
  id: number;
  title: string;
  status: "pending_pastor" | "pastor_signed" | "completed" | "declined";
  created_at: string;
};

const COPY_STATUS: Record<PolicyCopy["status"], { label: string; className: string }> = {
  pending_pastor: { label: "Awaiting signatures", className: "bg-purple-50 text-purple-800" },
  pastor_signed: { label: "With the clerk", className: "bg-mist-select text-bark" },
  completed: { label: "Fully signed", className: "bg-green-50 text-green-800" },
  declined: { label: "Declined", className: "bg-red-50 text-red-700" },
};

function authHeaders(): Record<string, string> {
  const token = typeof window === "undefined" ? null : localStorage.getItem("access_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * A desk's policy — the words its office works by.
 *
 * One page, edited in place: the leadership writes it, the roll reads it. It
 * prints on the church's own letterhead (the same sheet the letters desk
 * prints), and a policy that needs signatures is filed through the letters
 * flow, so the pastor's and the clerk's pens reach it as they reach any
 * paper. The copies come back here, each with its state and its signed sheet.
 */
export function DepartmentPolicyPanel({ code }: { code: string }) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [title, setTitle] = useState("Policy");
  const [content, setContent] = useState("");
  const [copies, setCopies] = useState<PolicyCopy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    // No state is written before the first await: the panel mounts on its
    // loading line, and everything else arrives with the server's answer.
    try {
      const [policyRes, copiesRes] = await Promise.all([
        fetch(`${API_URL}/api/members/departments/${code}/policy/`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/members/department-letters/?department=${code}&policy=1`, { headers: authHeaders() }),
      ]);
      const policyData = await policyRes.json().catch(() => ({}));
      if (policyRes.ok) {
        setPolicy(policyData as Policy);
        setTitle((policyData as Policy).title || "Policy");
        setContent((policyData as Policy).content || "");
      } else {
        showAlert("Could not open the policy", policyData.detail || "Try again.", "error");
      }
      const copiesData = await copiesRes.json().catch(() => []);
      setCopies(Array.isArray(copiesData) ? (copiesData as PolicyCopy[]) : []);
    } catch {
      showAlert("Network error", "Could not reach the server.", "error");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    // Deferred by a tick, the way the letters desk reads its own list: the
    // effect only starts the read, and the answers land on their own.
    void Promise.resolve().then(load);
  }, [load]);

  const canEdit = Boolean(policy?.can_edit);
  const dirty = Boolean(policy) && (title !== policy?.title || content !== policy?.content);
  const hasWords = content.trim().length > 0;

  const save = async () => {
    if (saving) return;
    if (!content.trim()) {
      showAlert("Nothing to save", "Write the policy first.", "info");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/members/departments/${code}/policy/`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ title: title.trim() || "Policy", content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert("Could not save the policy", data.detail || "Try again.", "error");
        return;
      }
      setPolicy(data as Policy);
      setTitle((data as Policy).title);
      setContent((data as Policy).content);
      showAlert("Policy saved", "The desk reads the new words from now on.", "success", {
        toast: true,
        timer: 4000,
        showConfirmButton: false,
      });
    } catch {
      showAlert("Network error", "Could not reach the server.", "error");
    } finally {
      setSaving(false);
    }
  };

  /** The sheet as it stands now, on the church's letterhead — a draft: nothing
   *  is stored and no pen is asked for. */
  const download = () => {
    if (!hasWords) {
      showAlert("Nothing to print", "Write the policy first.", "info");
      return;
    }
    const params = new URLSearchParams({ title: title.trim() || "Policy", content });
    openPdfTab(`${API_URL}/api/members/department-letters/preview/?${params.toString()}`, {
      fallbackError: "The policy sheet could not be opened.",
      onError: () => showAlert("Could not open the sheet", "Try again.", "error"),
    });
  };

  /** Hand the desk's own paper in: a PDF or Word document kept beside the
   *  words typed on the page. Uploading again replaces the copy before it. */
  const uploadDocument = async (file: File) => {
    if (uploading) return;
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (extension !== "pdf" && extension !== "docx") {
      showAlert("Not a policy document", "Upload the policy as a PDF or a Word (.docx) document.", "info");
      return;
    }
    setUploading(true);
    try {
      const token = typeof window === "undefined" ? null : localStorage.getItem("access_token");
      const body = new FormData();
      body.append("document", file);
      const res = await fetch(`${API_URL}/api/members/departments/${code}/policy/`, {
        method: "POST",
        // FormData brings its own boundary: a content type laid over it would
        // arrive unreadable.
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert("Could not upload it", data.document || data.detail || "Try again.", "error");
        return;
      }
      setPolicy(data as Policy);
      showAlert("Document uploaded", "The policy paper sits with its words.", "success", {
        toast: true,
        timer: 4000,
        showConfirmButton: false,
      });
    } catch {
      showAlert("Network error", "Could not reach the server.", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeDocument = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const res = await fetch(`${API_URL}/api/members/departments/${code}/policy/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert("Could not remove it", data.detail || "Try again.", "error");
        return;
      }
      setPolicy(data as Policy);
    } catch {
      showAlert("Network error", "Could not reach the server.", "error");
    } finally {
      setUploading(false);
    }
  };

  const sendForSignature = async () => {
    if (sending || !policy) return;
    if (!hasWords) {
      showAlert("Nothing to send", "Write the policy first.", "info");
      return;
    }
    if (dirty) {
      showAlert("Save it first", "The copy sent for signing is the policy as saved.", "info");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/members/department-letters/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          department: code,
          title: policy.title || "Policy",
          content: policy.content,
          is_policy: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert("Could not send it", data.detail || "Try again.", "error");
        return;
      }
      setCopies((current) => [data as PolicyCopy, ...current]);
      showAlert("Sent for signing", "The pastor's pen is asked for first, then the clerk's.", "success", {
        toast: true,
        timer: 5000,
        showConfirmButton: false,
      });
    } catch {
      showAlert("Network error", "Could not reach the server.", "error");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <p className="p-4 text-center text-xs text-moss">Loading the policy…</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto custom-hover-scrollbar p-3 sm:p-4">
      <section className="rounded-2xl border border-sand-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-line px-4 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-bark">
              <FileText className="h-4 w-4 text-ember" aria-hidden="true" />
              {title.trim() || "Policy"}
            </h3>
            <p className="mt-0.5 text-[11px] text-moss">
              {policy?.updated_at
                ? `Last written ${dayFirst(policy.updated_at.slice(0, 10))}${policy.updated_by_name ? ` by ${policy.updated_by_name}` : ""}.`
                : "The desk's policy, in one page."}
            </p>
          </div>
          <span className="text-[11px] font-semibold text-moss">
            {canEdit ? "You may write this" : "Read-only"}
          </span>
        </div>

        <div className="p-4">
          {canEdit ? (
            <>
              <label className="block text-xs font-semibold text-bark">
                Title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  className="mt-1 w-full rounded-xl border border-sand-mute px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember"
                />
              </label>
              <label className="mt-3 block text-xs font-semibold text-bark">
                The policy
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={18}
                  placeholder="Write the policy here — its purpose, who it covers, what it asks of them, and how the desk decides."
                  className="mt-1 w-full resize-y rounded-xl border border-sand-mute px-3.5 py-3 text-sm leading-6 text-bark outline-none focus:border-ember"
                />
              </label>
            </>
          ) : (
            <div className="rounded-xl border border-sand-line bg-sand-linen/50 p-4">
              {hasWords ? (
                <p className="whitespace-pre-wrap text-sm leading-7 text-bark">{content}</p>
              ) : (
                <p className="text-xs text-moss">The desk has not written its policy yet.</p>
              )}
            </div>
          )}
        </div>

        {/* The desk's own paper, where one was handed in: a PDF or Word file
            kept with the policy, opened from here and lifted again when a
            newer copy replaces it. */}
        {policy?.document_url && (
          <div className="flex flex-wrap items-center gap-2 border-t border-sand-line px-4 py-2.5">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-ember" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-bark">
              {policy.document_name || "Policy document"}
            </span>
            <a
              href={policy.document_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-lg border border-sand-line px-2.5 py-1 text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember"
            >
              Open
            </a>
            {canEdit && (
              <button
                type="button"
                onClick={() => void removeDocument()}
                disabled={uploading}
                aria-label="Remove the uploaded document"
                className="shrink-0 rounded-lg p-1 text-moss transition hover:text-red-600 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </section>

      {copies.length > 0 && (
        <section className="rounded-2xl border border-sand-line bg-white shadow-sm">
          <div className="border-b border-sand-line px-4 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-bark">
              <PenLine className="h-4 w-4 text-ember" aria-hidden="true" />
              Copies sent for signing
            </h3>
            <p className="mt-0.5 text-[11px] text-moss">
              Each one keeps the words it was sent with; a fully signed copy opens as the church&apos;s paper.
            </p>
          </div>
          <ul>
            {copies.map((copy) => {
              const status = COPY_STATUS[copy.status] ?? COPY_STATUS.pending_pastor;
              return (
                <li
                  key={copy.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-line/70 px-4 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-bark">{copy.title}</p>
                    <p className="text-[11px] text-moss">Sent {dayFirst(copy.created_at.slice(0, 10))}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>
                      {status.label}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        openPdfTab(`${API_URL}/api/members/department-letters/${copy.id}/pdf/`, {
                          fallbackError: "The policy sheet could not be opened.",
                          onError: () => showAlert("Could not open the sheet", "Try again.", "error"),
                        })
                      }
                      className="rounded-lg border border-sand-line px-2.5 py-1 text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember"
                    >
                      Open sheet
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      </div>

      {/* The page's buttons, held at the foot: the words and copies scroll
          above them and the bar stays where the hand expects it. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-sand-line bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3.5 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadDocument(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !canEdit}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3.5 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void sendForSignature()}
            disabled={sending || !canEdit}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3.5 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            {sending ? "Sending…" : "Send for signing"}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-ember-deep disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? "Saving…" : "Save policy"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
