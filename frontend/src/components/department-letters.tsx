"use client";

/**
 * The desk's letters — the paper an area writes, and the two pens it must
 * pass before it is worth anything.
 *
 * A letter is written (title and body), printed on the church's own
 * letterhead, and sent to the pastor. The pastor signs it with the signature
 * kept on their profile, the church clerk signs after them, and it then comes
 * back to whoever wrote it as a fully signed sheet, ready to carry to the
 * stamp. The register shows the letter and whose turn it is on, the button
 * the current signer needs, and the PDF — viewed while it travels, downloaded
 * once both signatures are on it.
 *
 * Writing is not a button on this register: the modal lives with the desk's
 * own buttons (see the hub's bottom bar), and a copy of it is exported here
 * for them (`WriteLetterModal`). The server owns every step: it decides who
 * may sign, that the pastor must sign before the clerk, and what the PDF
 * carries. This panel only asks the server what it may do, and shows the
 * answer.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileText, PenLine, Stamp, X } from "lucide-react";

import { resolveAttachmentUrl } from "@/components/announcement-attachment";
import { useHeaderData } from "@/hooks/use-header-data";
import { showAlert } from "@/lib/alerts";
import { dayFirst } from "@/lib/dates";
import { openPdfTab } from "@/lib/pdf-lightbox";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One row of the letter register, as the serializer sends it. */
type LetterRow = {
  id: number;
  department: number;
  department_name: string;
  department_code: string;
  requested_by: number;
  requested_by_name: string;
  title: string;
  content: string;
  status: "pending_pastor" | "pastor_signed" | "completed" | "declined";
  pastor_signed_by: number | null;
  pastor_name: string | null;
  pastor_signed_at: string | null;
  clerk_signed_by: number | null;
  clerk_name: string | null;
  clerk_signed_at: string | null;
  reply: string;
  declined_by_name: string | null;
  created_at: string;
};

/** The desk's own bearer header, read the way every other desk reads it. */
function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** What a letter's row wears while it is on its way between the two pens. */
const STATUS: Record<LetterRow["status"], { label: string; className: string }> = {
  pending_pastor: { label: "With the pastor", className: "bg-purple-50 text-purple-800" },
  pastor_signed: { label: "With the clerk", className: "bg-mist-select text-bark" },
  completed: { label: "Fully signed", className: "bg-green-50 text-green-800" },
  declined: { label: "Declined", className: "bg-red-50 text-red-700" },
};

/**
 * The compose form, as a modal — the desk's Write Letter button opens it.
 *
 * Kept beside the register it writes into: the paper is the same (title and
 * body, the two things a letter is made of), the endpoint is the same, and
 * the notice the desk hears is the same. `onSent` lets the desk refresh
 * whatever carried the letters before — a fresh copy of the register reads
 * the new row the moment its writer closes the modal.
 */
export function WriteLetterModal({
  open,
  department,
  onClose,
  onSent,
}: {
  open: boolean;
  department: { code: string; label: string };
  onClose: () => void;
  onSent?: () => void;
}) {
  const [letterDate, setLetterDate] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientChurch, setRecipientChurch] = useState("");
  const [recipientAddress1, setRecipientAddress1] = useState("");
  const [recipientAddress2, setRecipientAddress2] = useState("");
  const [recipientAddress3, setRecipientAddress3] = useState("");
  const [refNo, setRefNo] = useState("");
  const [subject, setSubject] = useState("");
  const [greeting, setGreeting] = useState("");
  const [body, setBody] = useState("");
  const [closing, setClosing] = useState("");
  const [signer1Name, setSigner1Name] = useState("");
  const [signer1Title, setSigner1Title] = useState("");
  const [signer1Contact, setSigner1Contact] = useState("");
  const [signer2Name, setSigner2Name] = useState("");
  const [signer2Title, setSigner2Title] = useState("");
  const [signer2Contact, setSigner2Contact] = useState("");
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const buildLetter = () => {
    const parts: string[] = [];
    if (letterDate.trim()) parts.push(letterDate.trim());
    parts.push("");
    parts.push("");
    if (recipientName.trim()) {
      parts.push(recipientName.trim());
    } else {
      parts.push("To the Pastor/ Church clerk,");
    }
    if (recipientChurch.trim()) parts.push(recipientChurch.trim());
    if (recipientAddress1.trim()) parts.push(recipientAddress1.trim());
    if (recipientAddress2.trim()) parts.push(recipientAddress2.trim());
    if (recipientAddress3.trim()) parts.push(recipientAddress3.trim());
    parts.push("");
    parts.push("");
    if (refNo.trim()) {
      parts.push(refNo.trim().startsWith("REF:") ? refNo.trim() : `REF: ${refNo.trim()}`);
    } else if (subject.trim()) {
      parts.push(`REF: ${subject.trim().toUpperCase()}`);
    }
    parts.push("");
    parts.push("");
    const greetingText = greeting.trim() || "Greetings in the name of our Lord and savior, Jesus Christ. We hope this letter finds you well.";
    parts.push(greetingText);
    parts.push("");
    if (body.trim()) {
      parts.push(body.trim());
    }
    parts.push("");
    const closingText = closing.trim() || "Please share your response at your earliest convenience for easier planning. We are looking forward to having you minister with us. God’s grace be with you.";
    parts.push(closingText);
    parts.push("");
    parts.push("");
    if (closingText.toLowerCase().includes("kind regards")) {
      // already has kind regards
    } else {
      parts.push("Kind regards,");
      parts.push("");
    }
    const line1 = [signer1Name.trim(), signer1Title.trim()].filter(Boolean).join(" ");
    const line2 = [signer2Name.trim(), signer2Title.trim()].filter(Boolean).join(" ");
    if (line1 || line2) {
      parts.push(`${line1.padEnd(60)} ${line2}`);
    }
    const contact1 = signer1Contact.trim();
    const contact2 = signer2Contact.trim();
    if (contact1 || contact2) {
      parts.push(`${contact1.padEnd(60)} ${contact2}`);
    }
    return parts.join("\n");
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    try {
      const title = subject.trim() || refNo.trim() || "Official Letter";
      const content = buildLetter();
      const response = await fetch(`${API_URL}/api/members/department-letters/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ department: department?.code ?? "", title: title.trim(), content: content.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.title || data.content || "The letter could not be sent.");
      onClose();
      onSent?.();
      showAlert(
        "Letter sent",
        "It is on the church letterhead with the pastor and clerk for signature; either can sign first. It comes back to you fully signed once both have signed.",
        "success"
      );
    } catch (error) {
      showAlert("Could not send the letter", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <form
        onSubmit={send}
        role="dialog"
        aria-modal="true"
        aria-label="Write a letter"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-sand-line"
      >
        <div className="flex items-start justify-between gap-3 border-b border-sand-line px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-bark">Write a letter</h3>
            <p className="mt-0.5 text-xs text-moss">
              Fill in the details below to construct the letter in the standard format.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-moss transition hover:bg-sand hover:text-bark"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-bark sm:col-span-2">
              Date
              <input
                value={letterDate}
                onChange={(event) => setLetterDate(event.target.value)}
                placeholder="e.g. 20/10/2026"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark sm:col-span-2">
              To (Recipient line)
              <input
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder="e.g. To the Pastor/ Church clerk,"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark">
              Church/Recipient Name
              <input
                value={recipientChurch}
                onChange={(event) => setRecipientChurch(event.target.value)}
                placeholder="e.g. Isiolo Central Point"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark">
              Address Line 1
              <input
                value={recipientAddress1}
                onChange={(event) => setRecipientAddress1(event.target.value)}
                placeholder="e.g. P.o Box 61-60300"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark">
              Address Line 2
              <input
                value={recipientAddress2}
                onChange={(event) => setRecipientAddress2(event.target.value)}
                placeholder="e.g. Isiolo."
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark">
              Address Line 3
              <input
                value={recipientAddress3}
                onChange={(event) => setRecipientAddress3(event.target.value)}
                placeholder=""
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark sm:col-span-2">
              REF *
              <input
                required
                value={refNo}
                onChange={(event) => setRefNo(event.target.value)}
                placeholder="e.g. REF: INVITATION OF ISIOLO CENTRAL POINT CHURCH CHOIR"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark sm:col-span-2">
              Subject/Title *
              <input
                required
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="e.g. Invitation to Choir Day"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark sm:col-span-2">
              Greeting (optional)
              <input
                value={greeting}
                onChange={(event) => setGreeting(event.target.value)}
                placeholder="e.g. Greetings in the name of our Lord and savior, Jesus Christ. We hope this letter finds you well."
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark sm:col-span-2">
              Body *
              <textarea
                required
                rows={6}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Write the main body of the letter..."
                className="mt-1 block w-full resize-y rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs leading-relaxed outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark sm:col-span-2">
              Closing (optional)
              <textarea
                rows={3}
                value={closing}
                onChange={(event) => setClosing(event.target.value)}
                placeholder="e.g. Please share your response at your earliest convenience... We are looking forward to having you minister with us. God’s grace be with you."
                className="mt-1 block w-full resize-y rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs leading-relaxed outline-none focus:border-ember"
              />
            </label>
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs font-medium text-bark">Signatures</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  value={signer1Name}
                  onChange={(e) => setSigner1Name(e.target.value)}
                  placeholder="Signer 1 Name"
                  className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                />
                <input
                  value={signer1Title}
                  onChange={(e) => setSigner1Title(e.target.value)}
                  placeholder="Signer 1 Title (e.g. Church Clerk)"
                  className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                />
                <input
                  value={signer1Contact}
                  onChange={(e) => setSigner1Contact(e.target.value)}
                  placeholder="Signer 1 Contact"
                  className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                />
                <input
                  value={signer2Name}
                  onChange={(e) => setSigner2Name(e.target.value)}
                  placeholder="Signer 2 Name"
                  className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                />
                <input
                  value={signer2Title}
                  onChange={(e) => setSigner2Title(e.target.value)}
                  placeholder="Signer 2 Title (e.g. Church Pastor)"
                  className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                />
                <input
                  value={signer2Contact}
                  onChange={(e) => setSigner2Contact(e.target.value)}
                  placeholder="Signer 2 Contact"
                  className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-sand-line bg-sand/30 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-moss">Letter Preview</p>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-bark">
              {buildLetter()}
            </pre>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-sand-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-sand-mute px-4 py-2 text-xs font-semibold text-moss transition hover:text-bark"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !subject.trim() || !body.trim()}
            className="rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send for signature"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** The church's letterhead, created right at the desk.
 *
 * One head for the whole church: the office uploads it as a finished image
 * — symbol, name and contact strip as they want them to print — and every
 * letter sent for signature is then composed on it, its title and body
 * beneath. Replacing it is the same act: upload again and it is swapped for
 * the next letter. Opening the desk's register shows what is on file; the
 * server refuses anyone who is not one of the handlers who signs.
 */
function LetterheadModal({
  currentUrl,
  onClose,
  onDone,
}: {
  currentUrl: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);

  const pick = (picked: File | undefined) => {
    setFile(picked ?? null);
    setPreview(picked ? URL.createObjectURL(picked) : "");
  };

  const save = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const body = new FormData();
      body.append("letterhead", file);
      const response = await fetch(`${API_URL}/api/members/letterhead/`, {
        method: "PUT",
        headers: authHeaders(),
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "The letterhead could not be saved.");
      showAlert("Letterhead saved", "Letters sent for signature now print on this head.", "success");
      onDone();
      onClose();
    } catch (error) {
      showAlert("Could not save the letterhead", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/members/letterhead/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "The letterhead could not be removed.");
      }
      showAlert("Letterhead removed", "Letters sent for signature go back to the paper's own drawn head.", "success");
      onDone();
      onClose();
    } catch (error) {
      showAlert("Could not remove the letterhead", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const shownUrl = preview || currentUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="The church letterhead"
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-sand-line"
      >
        <div className="flex items-start justify-between gap-3 border-b border-sand-line px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-bark">The church letterhead</h3>
            <p className="mt-0.5 text-xs text-moss">
              One head for the whole church — every letter sent for signature prints on it, its title and body beneath.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-moss transition hover:bg-sand hover:text-bark"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {shownUrl ? (
            <div className="rounded-xl border border-sand-line bg-sand/30 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-moss">On file</p>
              <div className="mt-2 flex items-center justify-center rounded-lg border border-sand-line bg-white px-4 py-3">
                {/* Plain img: the letterhead is a same-origin upload. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveAttachmentUrl(shownUrl)}
                  alt="The church letterhead"
                  className="max-h-40 w-full object-contain"
                />
              </div>
              <p className="mt-2 text-[11px] text-moss-faint">
                Replacing it is the same act — upload below and it is swapped for the next letter.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-sand-line bg-sand/30 px-4 py-3 text-xs text-moss">
              No letterhead on file yet — letters print on the paper&apos;s own drawn head until you create one here.
            </div>
          )}

          <label className="block text-sm font-medium text-bark">
            {shownUrl ? "Replace with" : "Create from"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => pick(event.target.files?.[0])}
              className="mt-1 block w-full cursor-pointer rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs text-moss file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-sand file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-bark hover:file:bg-sand-mute"
            />
          </label>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-sand-line px-5 py-3">
          {currentUrl ? (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={saving}
              className="rounded-xl border border-sand-mute px-4 py-2 text-xs font-semibold text-red-700 transition hover:border-red-400 disabled:opacity-60"
            >
              Remove
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-sand-mute px-4 py-2 text-xs font-semibold text-moss transition hover:text-bark"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !file}
              className="rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save letterhead"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DepartmentLettersPanel({
  department,
  // Which letters this copy reads. A desk's own panel answers for its desk
  // (`department.code`); an office's page — the Clerkship's Letter Approvals
  // — reads every letter in the church, because the clerk's pen is the
  // second one on all of them. The server decides what that reader may see.
  scope = "department",
  // The desk's panel caps its list so the ledger below it keeps its room;
  // an office's whole page gives the list the page instead.
  scrollList = true,
  // Bump to make the panel read again — a letter written in the desk's own
  // modal (the footer's Write Letter button) lands in the register this way.
  version = 0,
  className = "shrink-0 overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm",
}: {
  /** The area whose letters these are — the panel is always read for one desk. */
  department?: { code: string; label: string };
  scope?: "department" | "all";
  scrollList?: boolean;
  version?: number;
  className?: string;
}) {
  const { me } = useHeaderData();
  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  // The two pens: the pastor clears it first, the clerk countersigns. The
  // server refuses anything else; the buttons only show what it would take.
  const canSignPastor = roles.includes("pastor") || roles.includes("admin");
  const canSignClerk = roles.includes("clerk") || roles.includes("admin");

  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [loading, setLoading] = useState(true);
  // The letter being signed, and whose signature it is waiting for.
  const [signing, setSigning] = useState<{ row: LetterRow; action: "pastor_sign" | "clerk_sign" | "decline" } | null>(null);
  const [savingSignature, setSavingSignature] = useState(false);
  // The signer's own saved signature, read when the modal opens so the paper
  // shows what the pen will actually put on it.
  const [mySignature, setMySignature] = useState<{ url: string; office: string; name: string } | null>(null);
  const [pdfId, setPdfId] = useState<number | null>(null);
  // The church's letterhead, and whether its modal is open. Read only by the
  // pens that sign — a member reading the register has no head to manage.
  const [letterhead, setLetterhead] = useState<{ url: string } | null>(null);
  const [letterheadOpen, setLetterheadOpen] = useState(false);

  const loadLetterhead = useCallback(() => {
    fetch(`${API_URL}/api/members/letterhead/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setLetterhead(data?.has_letterhead ? { url: data.letterhead_url } : null))
      .catch(() => {
        // A head no one has created yet reads as none; nothing to note.
      });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const query = scope === "all" ? "" : `?department=${encodeURIComponent(department?.code ?? "")}`;
    fetch(`${API_URL}/api/members/department-letters/${query}`, {
      headers: authHeaders(),
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLetters(Array.isArray(data) ? data : []))
      .catch(() => setLetters([]))
      .finally(() => setLoading(false));
  }, [department?.code, scope]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load, version]);

  // One head for the church, read by the ones who would touch it.
  useEffect(() => {
    if (canSignPastor || canSignClerk) void Promise.resolve().then(loadLetterhead);
  }, [canSignPastor, canSignClerk, loadLetterhead, version]);

  /** The pen this reader may put on this letter, or null — the server's rule, read here. */
  const signActionFor = (row: LetterRow): "pastor_sign" | "clerk_sign" | "decline" | null => {
    if (row.status === "pending_pastor" && canSignPastor) return "pastor_sign";
    if (row.status === "pastor_signed" && canSignClerk) return "clerk_sign";
    if (row.status === "pastor_signed" && canSignPastor) return "decline";
    return null;
  };

  const openSign = async (row: LetterRow, action: "pastor_sign" | "clerk_sign" | "decline") => {
    setSigning({ row, action });
    setMySignature(null);
    try {
      const response = await fetch(`${API_URL}/api/members/me/`, { headers: authHeaders() });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setMySignature({
          url: data?.signature_url || "",
          office: data?.signature_office || "",
          name: data?.name || "",
        });
      }
    } catch {
      // Without the preview the signing still works; the paper prints the
      // signature saved on the profile, not this reading of it.
    }
  };

  const sign = async () => {
    if (!signing) return;
    setSavingSignature(true);
    try {
      const response = await fetch(`${API_URL}/api/members/department-letters/${signing.row.id}/review/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action: signing.action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "The signature could not be recorded.");
      setSigning(null);
      showAlert(
        "Signed",
        signing.action === "pastor_sign"
          ? "Your signature is on the letter. The church clerk signs it next."
          : signing.action === "clerk_sign"
            ? "Your signature is on the letter. It is back with its writer, fully signed and ready for the stamp."
            : "Your letter was declined. The requester has been notified.",
        "success"
      );
      load();
    } catch (error) {
      showAlert("Could not sign", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSavingSignature(false);
    }
  };

  /** Read the sheet while it travels; a signed copy keeps its own Download
   *  from the tab's PDF reader once the browser is showing it. */
  const openPdf = (row: LetterRow) => {
    if (pdfId !== null) return;
    setPdfId(row.id);
    openPdfTab(`${API_URL}/api/members/department-letters/${row.id}/pdf/`, {
      headers: authHeaders(),
      fallbackError: "That letter could not be opened.",
      onError: (message) => showAlert("Could not open the letter", message, "error"),
      onSettled: () => setPdfId(null),
    });
  };

  return (
    <section className={className}>
      <header className="flex items-center justify-between gap-2 border-b border-sand-line bg-sand/20 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-xs font-bold uppercase tracking-wide text-bark">Letters</h2>
          <p className="truncate text-[11px] text-moss">
            {scope === "all"
              ? "Every letter the church writes — the pastor's signature first, then the clerk's, then back to its writer for the stamp."
              : "Written here, signed by the pastor then the clerk, and returned fully signed for stamping."}
          </p>
        </div>
        {(canSignPastor || canSignClerk) && (
          <button
            type="button"
            onClick={() => {
              loadLetterhead();
              setLetterheadOpen(true);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-sand-mute px-2.5 py-1.5 text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember"
          >
            <Stamp className="h-3.5 w-3.5" aria-hidden="true" />
            Letterhead
          </button>
        )}
      </header>

      <div className={`custom-hover-scrollbar overflow-y-auto ${scrollList && letters.length > 0 ? "max-h-64" : ""}`}>
        {loading ? (
          <p className="px-4 py-6 text-center text-xs text-moss">Loading the letters…</p>
        ) : letters.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-6 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sand text-ember">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-2 text-sm font-semibold text-bark">No letters yet</p>
            <p className="mt-0.5 max-w-sm text-xs text-moss">
              {scope === "all"
                ? "Letters from every desk arrive here for the pastor's signature, then the clerk's — sign, send back with a reason, or read the signed sheet."
                : "Letters written on this desk arrive here to be signed or sent back with a reason."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-sand-line">
            {letters.map((row) => {
              const status = STATUS[row.status] ?? STATUS.pending_pastor;
              const signAction = signActionFor(row);
              const busy = pdfId === row.id;
              return (
                <li key={row.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-bark">{row.title}</p>
                      <p className="mt-0.5 truncate text-[11px] text-moss">
                        {/* A page over every desk must name the desk: the same
                            title could belong to any of them. */}
                        {scope === "all" ? `${row.department_name} · ` : ""}
                        {row.requested_by_name} · {dayFirst(row.created_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  {/* Who has put their pen on it so far, and whose turn it is. */}
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-moss-faint">
                    <span>{row.pastor_name ? `Pastor signed by ${row.pastor_name}` : "Waiting for the pastor"}</span>
                    <span>
                      {row.clerk_name
                        ? `Clerk signed by ${row.clerk_name}`
                        : row.status === "declined"
                          ? `Declined${row.declined_by_name ? ` by ${row.declined_by_name}` : ""}`
                          : "Clerk yet to sign"}
                    </span>
                  </p>
                  {row.status === "declined" && row.reply && (
                    <p className="mt-1 text-[11px] italic text-moss-faint">&quot;{row.reply}&quot;</p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {signAction && (
                      <button
                        type="button"
                        onClick={() => void openSign(row, signAction)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-bark px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-bark/90"
                      >
                        <PenLine className="h-3 w-3" />
                        {signAction === "pastor_sign" ? "Sign as pastor" : signAction === "clerk_sign" ? "Sign as clerk" : "Reject"}
                      </button>
                    )}
                    {signAction && signAction !== "decline" && (
                      <button
                        type="button"
                        onClick={() => void openSign(row, "decline")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-ember px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-ember-deep"
                      >
                        <X className="h-3 w-3" />
                        Reject
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void openPdf(row)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sand-mute px-3 py-1.5 text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember disabled:opacity-60"
                    >
                      {busy ? "Preparing…" : "View letter"}
                    </button>
                    {row.status === "completed" && (
                      <button
                        type="button"
                        onClick={() => void openPdf(row)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sand-mute px-3 py-1.5 text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember disabled:opacity-60"
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* The church's letterhead — created here by the hands that sign. */}
      {letterheadOpen && (
        <LetterheadModal
          currentUrl={letterhead?.url ?? ""}
          onClose={() => setLetterheadOpen(false)}
          onDone={() => loadLetterhead()}
        />
      )}

      {/* Sign — the letter on the table, the signature that will go on it, and the pen. */}
      {signing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={signing.action === "pastor_sign" ? "Sign as pastor" : "Sign as clerk"}
            className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-sand-line"
          >
            <div className="flex items-start justify-between gap-3 border-b border-sand-line px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-bark">
                  {signing.action === "pastor_sign" ? "Pastor's signature" : "Church clerk's signature"}
                </h3>
                <p className="mt-0.5 truncate text-xs text-moss">
                  {signing.row.title} · {signing.row.department_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSigning(null)}
                aria-label="Close"
                className="rounded-lg p-1 text-moss transition hover:bg-sand hover:text-bark"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="max-h-48 overflow-y-auto whitespace-pre-line rounded-xl border border-sand-line bg-sand/30 p-3 text-xs leading-relaxed text-bark">
                {signing.row.content}
              </div>

              <div className="rounded-xl border border-sand-line p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-moss">Your signature</p>
                {mySignature?.url ? (
                  <div className="mt-2 flex h-16 items-end justify-center rounded-lg border border-sand-line bg-white px-4 pb-1">
                    {/* Plain img: the signature is a same-origin upload. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveAttachmentUrl(mySignature.url)}
                      alt={mySignature.office || "Your saved signature"}
                      className="max-h-12 w-full object-contain object-bottom"
                    />
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-moss">
                    No signature saved on your profile yet — the line prints blank.{" "}
                    <Link href="/member" className="font-semibold text-ember underline underline-offset-2">
                      Add your signature
                    </Link>
                  </p>
                )}
                <p className="mt-2 text-[11px] text-moss-faint">
                  {mySignature?.name ? `${mySignature.name} · ` : ""}
                  Signing records you as the {signing.action === "pastor_sign" ? "pastor" : "church clerk"} who cleared
                  it, and the sheet carries your saved signature.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-sand-line px-5 py-3">
              <button
                type="button"
                onClick={() => setSigning(null)}
                className="rounded-xl border border-sand-mute px-4 py-2 text-xs font-semibold text-moss transition hover:text-bark"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void sign()}
                disabled={savingSignature}
                className="rounded-xl bg-bark px-4 py-2 text-xs font-semibold text-white transition hover:bg-bark/90 disabled:opacity-60"
              >
                {savingSignature ? "Signing…" : "Sign this letter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
