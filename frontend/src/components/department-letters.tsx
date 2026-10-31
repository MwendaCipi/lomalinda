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
 * Writing is not a button on this register: the writer opens next to the
 * desk's own buttons (see the hub's bottom bar), and a copy of it is exported
 * here for them (`WriteLetterModal`). On a desk it takes the view as a page —
 * typing on the left, the paper it prints on the right; a phone keeps one
 * card. The server owns every step: it decides who
 * may sign, that the pastor must sign before the clerk, and what the PDF
 * carries. This panel only asks the server what it may do, and shows the
 * answer.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Download, FileText, Link2, MoveLeft, PenLine, Redo2, Stamp, Undo2, X } from "lucide-react";

import { resolveAttachmentUrl } from "@/components/announcement-attachment";
import { useHeaderData } from "@/hooks/use-header-data";
import { showAlert } from "@/lib/alerts";
import { dayFirst } from "@/lib/dates";
import { useUndoHistory } from "@/lib/undo-history";
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
  recipient_name: string;
  recipient_address: string;
  recipient_town: string;
  recipient_phone: string;
  recipient_email: string;
  recipient_response: null | "accepted" | "turned_down";
  recipient_comment: string;
  responded_at: string | null;
  created_at: string;
};

/** The desk's own bearer header, read the way every other desk reads it. */
function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** One pen on the paper's sign-off, as the offices hand it to the preview. */
type LetterSignatory = { name: string; office: string; phone: string };

/** The name a pen prints — the pastor's pen wears the ministry's courtesy
 *  title, as the template writes it, unless the name already carries one. */
function penName(signatory: LetterSignatory | null | undefined) {
  const name = (signatory?.name ?? "").trim();
  if (!name) return "";
  const office = (signatory?.office ?? "").toLowerCase();
  if (office.includes("pastor") && !/^(pr\.|pastor)/i.test(name)) return `Pr. ${name}`;
  return name;
}

/** The page a shared letter's link opens: the recipient reads and answers here.
 *  The site exports statically, so the token rides the URL's query — the
 *  same shape the reset-password page reads. */
function publicLetterUrl(token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/letters?t=${token}`;
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
  variant = "modal",
  onClose,
  onSent,
}: {
  open: boolean;
  department: { code: string; label: string };
  /** "page" opens inline on a desk, writing beside the paper; "modal" is the
      phone-sized card. */
  variant?: "modal" | "page";
  onClose: () => void;
  onSent?: () => void;
}) {
  const [letterDate, setLetterDate] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientTown, setRecipientTown] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  // The letter's writing lives in office-style undo and redo: the subject
  // and the body share one memory — every edit is a step, and a streak of
  // typing folds into a single one — so the two buttons walk the letter back
  // and forward the way a word processor's do.
  const draftHistory = useUndoHistory<{ subject: string; body: string }>({ subject: "", body: "" });
  const subject = draftHistory.current.subject;
  const body = draftHistory.current.body;
  const [sending, setSending] = useState(false);
  // The pen pair the sheet previews before anyone signs: one clerk and one
  // pastor, picked from the church's own offices. Whoever actually signs
  // replaces their details at signing time (the paper prints the signer
  // that day, not the keeper shown while the letter was being typed).
  const [signatories, setSignatories] = useState<{ clerk: LetterSignatory | null; pastor: LetterSignatory | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`${API_URL}/api/members/department-letters/signatories/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setSignatories({ clerk: data.clerk ?? null, pastor: data.pastor ?? null });
      })
      .catch(() => {
        // Without the pair the paper still signs: the blank pen lines print
        // as they always have.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // The block the paper composes under the salutation. Recipient phone and
  // email stay in the clerk's request record for delivery, not on the paper.
  const recipientBlock = () => {
    const lines = [recipientName, recipientAddress, recipientTown]
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.map((line, index) => index < lines.length - 1 ? `${line.replace(/,+$/, "")},` : line);
  };

  // The preview text, as it will print — but typed live, so the writer sees
  // everything the sheet will carry while they write it.
  const clerkName = penName(signatories?.clerk);
  const pastorName = penName(signatories?.pastor);

  if (!open) return null;

  // A short look at the paper as it will print: date beside the address,
  // the salutation every letter carries, the subject as its REF line, and
  // the body as written. Greeting, closing and signature spaces belong to
  // the paper itself — the writer never types them.
  const preview = [
    letterDate.trim() || dayFirst(new Date()),
    recipientAddress.trim(),
    "",
    "To the Pastor/ Church clerk,",
    "",
    `REF: ${(subject.trim() || "Subject").toUpperCase()}`,
    "",
    body.trim(),
    "",
    "Kind regards,",
    "",
    // The two pens, clerk left and pastor right, exactly as the paper lays
    // them out — name, the signing gap between it and the office, the
    // office's own number beneath.
    ...(clerkName ? [clerkName, ""] : []),
    signatories?.clerk?.office || "Church Clerk",
    ...(signatories?.clerk?.phone ? [signatories.clerk.phone] : []),
    "",
    ...(pastorName ? [pastorName, ""] : []),
    signatories?.pastor?.office || "Church Pastor",
    ...(signatories?.pastor?.phone ? [signatories.pastor.phone] : []),
  ].filter((line, index, lines) => !(line === "" && lines[index + 1] === "")).join("\n");

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    try {
      const title = subject.trim() || "Official Letter";
      const response = await fetch(`${API_URL}/api/members/department-letters/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          department: department?.code ?? "",
          title: title.trim(),
          content: body.trim(),
          letter_date: letterDate.trim(),
          recipient_name: recipientName.trim(),
          recipient_address: recipientAddress.trim(),
          recipient_town: recipientTown.trim(),
          recipient_phone: recipientPhone.trim(),
          recipient_email: recipientEmail.trim(),
        }),
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

  // The document itself, in the browser's own PDF viewer — the same sheet
  // the church will print, generated from the draft alone and shown the
  // way the other papers are (through the reader that never blinks on a
  // phone). Nothing is saved and nothing sent; the writer can still choose
  // to walk away after looking.
  const viewDocument = () => {
    const params = new URLSearchParams({
      title: subject.trim() || "Official Letter",
      content: body.trim(),
      letter_date: letterDate.trim(),
      recipient_name: recipientName.trim(),
      recipient_address: recipientAddress.trim(),
      recipient_town: recipientTown.trim(),
      recipient_phone: recipientPhone.trim(),
      recipient_email: recipientEmail.trim(),
    });
    openPdfTab(`${API_URL}/api/members/department-letters/preview/?${params.toString()}`, {
      fallbackError: "The letter could not be opened.",
    });
  };

  // The desk reads the letter where it writes it: the sheet takes the whole
  // viewport, a pinned bar above and the letter written beside the paper it
  // prints on — the way the programme editor opens. A phone keeps the
  // one-card modal below.
  if (variant === "page") {
    return (
      <section
        aria-label="Write a letter"
        role="presentation"
        // The page takes the viewport without scrolling itself: on a desk the
        // two columns — writing on the left, the paper on the right — each
        // scroll on their own.
        className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-sand print:hidden md:overflow-hidden"
      >
        {/* The way back, pinned to the top of the page, so it never travels
            out with the scroll. */}
        <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-sand-line bg-sand px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold text-bark transition hover:text-ember"
          >
            <MoveLeft className="h-4 w-4" aria-hidden="true" /> Back to requests
          </button>
          <p className="text-sm font-semibold text-bark">Write a letter</p>
        </header>
        <form onSubmit={send} className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col bg-white px-4 pb-5 pt-4 shadow-sm sm:px-6">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 md:grid md:grid-cols-2 md:gap-0 md:divide-x md:divide-sand-line">
            {/* The typing, on the left — its own scroll on a desk, ruled off
                from the reading side by the line running the two columns
                down the middle. */}
            <div className="flex min-w-0 flex-col md:h-full md:min-h-0 md:pr-6">
              <p className="shrink-0 text-xs text-moss">
                Typed on the left; on the right, the letter as the church will print it.
              </p>
              <div className="mt-3 min-w-0 flex-1 space-y-3 md:overflow-y-auto md:pr-1.5 custom-hover-scrollbar">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-bark">
                    Date
                    <input
                      value={letterDate}
                      onChange={(event) => setLetterDate(event.target.value)}
                      placeholder="e.g. 20/10/2026"
                      className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                    />
                  </label>
                  <label className="block text-xs font-medium text-bark">
                    Recipient name
                    <input
                      value={recipientName}
                      onChange={(event) => setRecipientName(event.target.value)}
                      placeholder="e.g. Isiolo Central Point Church"
                      className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                    />
                  </label>
                  <label className="block text-xs font-medium text-bark">
                    Address
                    <input
                      value={recipientAddress}
                      onChange={(event) => setRecipientAddress(event.target.value)}
                      placeholder="e.g. P.o Box 61-60300"
                      className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                    />
                  </label>
                  <label className="block text-xs font-medium text-bark">
                    Town
                    <input
                      value={recipientTown}
                      onChange={(event) => setRecipientTown(event.target.value)}
                      placeholder="e.g. Isiolo"
                      className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                    />
                  </label>
                  <label className="block text-xs font-medium text-bark">
                    Recipient phone <span className="font-normal text-moss">(for clerk only)</span>
                    <input
                      value={recipientPhone}
                      onChange={(event) => setRecipientPhone(event.target.value)}
                      placeholder="e.g. 0710570874"
                      className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                    />
                  </label>
                  <label className="block text-xs font-medium text-bark">
                    Recipient email <span className="font-normal text-moss">(for clerk only)</span>
                    <input
                      value={recipientEmail}
                      onChange={(event) => setRecipientEmail(event.target.value)}
                      placeholder="e.g. choir@isiolocentralpoint.org"
                      className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                    />
                  </label>
                  <label className="block text-xs font-medium text-bark sm:col-span-2">
                    Subject/Title *
                    <input
                      required
                      value={subject}
                      onChange={(event) => draftHistory.commit((cur) => ({ ...cur, subject: event.target.value }), true)}
                      placeholder="e.g. Invitation to Choir Day"
                      className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                    />
                  </label>
                  <label className="block text-xs font-medium text-bark sm:col-span-2">
                    Body *
                    <textarea
                      required
                      rows={14}
                      value={body}
                      onChange={(event) => draftHistory.commit((cur) => ({ ...cur, body: event.target.value }), true)}
                      placeholder="Write the main body of the letter..."
                      className="mt-1 block min-h-[18rem] w-full resize-none rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs leading-relaxed outline-none focus:border-ember"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* The paper, on the right: the letter laid out the way the church
                prints it — the date alone, the salutation, the receiving
                address beneath it, the subject as its REF line, the body,
                the closing and the two pens' spaces — travelling with every
                word typed on the left. */}
            <div className="shrink-0 md:min-h-0 md:flex-1 md:overflow-y-auto custom-hover-scrollbar md:pl-6">
              <p className="text-[11px] font-bold uppercase tracking-wide text-moss">Letter preview</p>
              <article className="mx-auto mt-2 w-full max-w-2xl rounded-lg border border-sand-line bg-white px-7 py-9 font-serif text-[13px] leading-relaxed text-bark shadow-sm">
                <p>{letterDate.trim() || dayFirst(new Date())}</p>
                <p className="mt-4">To the Pastor/ Church clerk,</p>
                <p className={`mt-4 whitespace-pre-line${recipientBlock().length ? "" : " text-moss-faint"}`}>
                  {recipientBlock().length ? recipientBlock().join("\n") : "Recipient name, address and town"}
                </p>
                <p className="mt-6">
                  <span className="font-semibold">REF: </span>
                  {subject.trim() || <span className="text-moss-faint">Subject</span>}
                </p>
                <div className="mt-6 whitespace-pre-line">
                  {body.trim() || <span className="text-moss-faint">The body of the letter will appear here as you type it…</span>}
                </div>
                {/* The closing and the two pens' spaces, the paper's own — the
                    names print beneath the pens once the office-holders have
                    signed. */}
                <p className="mt-8">Kind regards,</p>
                <div className="mt-6 grid grid-cols-2 gap-8 text-[12px]">
                  {/* The pen pair the offices hand the paper: name above the
                      signing gap, office and its number beneath the gap —
                      whoever signs last replaces the keeper shown here. */}
                  <div>
                    {clerkName
                      ? <p>{clerkName}</p>
                      : <p className="text-moss-faint">Clerk&apos;s name</p>}
                    <div className="h-10" aria-hidden="true" />
                    <p>{signatories?.clerk?.office || "Church Clerk"}</p>
                    {signatories?.clerk?.phone && <p>{signatories.clerk.phone}</p>}
                  </div>
                  <div>
                    {pastorName
                      ? <p>{pastorName}</p>
                      : <p className="text-moss-faint">Pastor&apos;s name</p>}
                    <div className="h-10" aria-hidden="true" />
                    <p>{signatories?.pastor?.office || "Church Pastor"}</p>
                    {signatories?.pastor?.phone && <p>{signatories.pastor.phone}</p>}
                  </div>
                </div>
              </article>
            </div>
          </div>

          {/* The buttons' strip runs across both sides now — the form they
              answer sits above them on the left, the paper answering on the
              right — and its buttons are centred on the strip. */}
          <div className="mt-3 flex shrink-0 flex-wrap items-center justify-center gap-2 rounded-2xl border border-sand-line bg-white px-2.5 py-2.5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={draftHistory.undo}
                disabled={!draftHistory.canUndo}
                title="Undo the last edit"
                aria-label="Undo"
                className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-2 text-xs font-semibold text-bark transition enabled:hover:border-ember enabled:hover:text-ember disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Undo</span>
              </button>
              <button
                type="button"
                onClick={draftHistory.redo}
                disabled={!draftHistory.canRedo}
                title="Redo the edit just undone"
                aria-label="Redo"
                className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-2 text-xs font-semibold text-bark transition enabled:hover:border-ember enabled:hover:text-ember disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Redo2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Redo</span>
              </button>
            </div>
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
                onClick={viewDocument}
                disabled={!subject.trim() || !body.trim()}
                title="See the letter as the church will print it"
                className="rounded-xl border border-sand-line bg-white px-4 py-2 text-xs font-semibold text-bark transition enabled:hover:border-ember enabled:hover:text-ember disabled:opacity-50"
              >
                View Document
              </button>
              <button
                type="submit"
                disabled={sending || !subject.trim() || !body.trim()}
                className="rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send for signature"}
              </button>
            </div>
          </div>
        </form>
      </section>
    );
  }

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
            <label className="block text-xs font-medium text-bark">
              Date
              <input
                value={letterDate}
                onChange={(event) => setLetterDate(event.target.value)}
                placeholder="e.g. 20/10/2026"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark">
              Recipient name
              <input
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder="e.g. Isiolo Central Point Church"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark">
              Address
              <input
                value={recipientAddress}
                onChange={(event) => setRecipientAddress(event.target.value)}
                placeholder="e.g. P.o Box 61-60300"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark">
              Town
              <input
                value={recipientTown}
                onChange={(event) => setRecipientTown(event.target.value)}
                placeholder="e.g. Isiolo"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark">
              Recipient phone <span className="font-normal text-moss">(for clerk only)</span>
              <input
                value={recipientPhone}
                onChange={(event) => setRecipientPhone(event.target.value)}
                placeholder="e.g. 0710570874"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark">
              Recipient email <span className="font-normal text-moss">(for clerk only)</span>
              <input
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                placeholder="e.g. choir@isiolocentralpoint.org"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark sm:col-span-2">
              Subject/Title *
              <input
                required
                value={subject}
                onChange={(event) => draftHistory.commit((cur) => ({ ...cur, subject: event.target.value }), true)}
                placeholder="e.g. Invitation to Choir Day"
                className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs outline-none focus:border-ember"
              />
            </label>
            <label className="block text-xs font-medium text-bark sm:col-span-2">
              Body *
              <textarea
                required
                rows={8}
                value={body}
                onChange={(event) => draftHistory.commit((cur) => ({ ...cur, body: event.target.value }), true)}
                placeholder="Write the main body of the letter..."
                className="mt-1 block w-full resize-y rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs leading-relaxed outline-none focus:border-ember"
              />
            </label>
          </div>
          <div className="rounded-xl border border-sand-line bg-sand/30 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-moss">Letter Preview</p>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-bark">
              {preview}
            </pre>
          </div>
        </div>

        <div className="flex shrink-0 justify-between gap-2 border-t border-sand-line px-5 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={draftHistory.undo}
              disabled={!draftHistory.canUndo}
              title="Undo the last edit"
              aria-label="Undo"
              className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-2 text-xs font-semibold text-bark transition enabled:hover:border-ember enabled:hover:text-ember disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Undo</span>
            </button>
            <button
              type="button"
              onClick={draftHistory.redo}
              disabled={!draftHistory.canRedo}
              title="Redo the edit just undone"
              aria-label="Redo"
              className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-2 text-xs font-semibold text-bark transition enabled:hover:border-ember enabled:hover:text-ember disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Redo2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Redo</span>
            </button>
          </div>
          <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-sand-mute px-4 py-2 text-xs font-semibold text-moss transition hover:text-bark"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={viewDocument}
            disabled={!subject.trim() || !body.trim()}
            title="See the letter as the church will print it"
            className="rounded-xl border border-sand-line bg-white px-4 py-2 text-xs font-semibold text-bark transition enabled:hover:border-ember enabled:hover:text-ember disabled:opacity-50"
          >
            View Document
          </button>
          <button
            type="submit"
            disabled={sending || !subject.trim() || !body.trim()}
            className="rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send for signature"}
          </button>
          </div>
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
  // The letter being shared out, and the modal that shows its two travels:
  // the paper for the desk to carry, the link the recipient reads and answers.
  const [sharing, setSharing] = useState<number | null>(null);
  const [shareTarget, setShareTarget] = useState<{ row: LetterRow; token: string } | null>(null);

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

  /** Share a fully signed letter: mint (or reuse) its public token, then
   *  open the modal that shows both ways it travels — the paper and the
   *  link the recipient reads and answers on. */
  const shareLetter = async (row: LetterRow) => {
    setSharing(row.id);
    try {
      const response = await fetch(`${API_URL}/api/members/department-letters/${row.id}/share/`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "The letter could not be shared.");
      setShareTarget({ row, token: data.share_token as string });
    } catch (error) {
      showAlert("Could not share the letter", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSharing(null);
    }
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

                  {/* These delivery details belong to the clerk's work queue,
                      not to the printed correspondence. */}
                  {canSignClerk && (row.recipient_phone || row.recipient_email) && (
                    <p className="mt-1 text-[11px] text-moss">
                      Delivery contacts (not printed): {row.recipient_phone}
                      {row.recipient_phone && row.recipient_email ? " · " : ""}
                      {row.recipient_email && <a className="hover:text-ember hover:underline" href={`mailto:${row.recipient_email}`}>{row.recipient_email}</a>}
                    </p>
                  )}

                  {/* What the recipient answered on a shared letter, if they have. */}
                  {row.recipient_response && (
                    <p className="mt-1 text-[11px] italic text-moss-faint">
                      Recipient {row.recipient_response === "accepted" ? "accepted" : "turned down"} the request
                      {row.recipient_comment ? `: “${row.recipient_comment}”` : ""}
                    </p>
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
                        onClick={() => void shareLetter(row)}
                        disabled={sharing === row.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sand-mute px-3 py-1.5 text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember disabled:opacity-60"
                      >
                        <Link2 className="h-3 w-3" />
                        {sharing === row.id ? "Preparing…" : "Share"}
                      </button>
                    )}
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

      {/* Share — a fully signed letter's two travels: the paper to pass
          around, or a link the recipient opens, reads and answers on. */}
      {shareTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Share this letter"
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-sand-line"
          >
            <div className="flex items-start justify-between gap-3 border-b border-sand-line px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-bark">Share this letter</h3>
                <p className="mt-0.5 truncate text-xs text-moss">{shareTarget.row.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setShareTarget(null)}
                aria-label="Close"
                className="rounded-lg p-1 text-moss transition hover:bg-sand hover:text-bark"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <div className="rounded-xl border border-sand-line p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-moss">Share the letter itself</p>
                <p className="mt-1 text-xs text-moss">
                  Open the signed sheet as a PDF — view it, print it or carry it to the stamp.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    openPdf(shareTarget.row);
                    setShareTarget(null);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-sand-mute px-3 py-1.5 text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember"
                >
                  <FileText className="h-3 w-3" />
                  Open the letter
                </button>
              </div>

              <div className="rounded-xl border border-sand-line p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-moss">Share a link with the recipient</p>
                <p className="mt-1 text-xs text-moss">
                  Anyone holding this link reads the letter — they need no account — and can accept or turn down the
                  request, with a comment. They can print the signed copy from the same page.
                </p>
                <div className="mt-2 flex items-stretch gap-1.5">
                  <input
                    readOnly
                    value={publicLetterUrl(shareTarget.token)}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-lg border border-sand-mute bg-sand/30 px-2.5 py-1.5 text-[11px] text-bark"
                    aria-label="Shareable letter link"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const url = publicLetterUrl(shareTarget.token);
                      try {
                        if (navigator.share) {
                          await navigator.share({ title: shareTarget.row.title, url });
                        } else {
                          await navigator.clipboard.writeText(url);
                          showAlert("Link copied", "Paste it wherever the recipient will see it.", "success");
                        }
                      } catch {
                        // Copy cancelled or unavailable — the box above still
                        // shows the link for a manual copy.
                      }
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-bark px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-bark/90"
                  >
                    <Copy className="h-3 w-3" />
                    Share
                  </button>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 justify-end border-t border-sand-line px-5 py-3">
              <button
                type="button"
                onClick={() => setShareTarget(null)}
                className="rounded-xl border border-sand-mute px-4 py-2 text-xs font-semibold text-moss transition hover:text-bark"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
