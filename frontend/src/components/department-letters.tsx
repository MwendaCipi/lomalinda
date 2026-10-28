"use client";

/**
 * The desk's letters — the paper an area writes, and the two pens it must
 * pass before it is worth anything.
 *
 * A letter is written here (title and body), printed on the church's own
 * letterhead, and sent to the pastor. The pastor signs it with the signature
 * kept on their profile, the church clerk signs after them, and it then comes
 * back to whoever wrote it as a fully signed sheet, ready to carry to the
 * stamp. The screen therefore shows three things and no more: the letter and
 * whose turn it is on, the button the current signer needs, and the PDF —
 * viewed while it travels, downloaded once both signatures are on it.
 *
 * The server owns every step: it decides who may sign, that the pastor must
 * sign before the clerk, and what the PDF carries. This panel only asks the
 * server what it may do, and shows the answer.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileText, PenLine, X } from "lucide-react";

import { resolveAttachmentUrl } from "@/components/announcement-attachment";
import { useHeaderData } from "@/hooks/use-header-data";
import { showAlert } from "@/lib/alerts";
import { dayFirst } from "@/lib/dates";

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

/**
 * Hand a finished PDF to the browser.
 *
 * A desktop opens the sheet in its own tab, where the browser offers print
 * and save; a phone refuses a popup raised this long after the tap, so the
 * file is downloaded directly, with the anchor mounted first — mobile
 * browsers ignore `download` on an anchor that was never in the document.
 * The blob is never revoked: the tab re-reads its URL whenever Save is
 * pressed, and a revoked URL turns that later save into an error.
 */
const deliverPdf = (blob: Blob, filename: string, forceDownload = false) => {
  const url = URL.createObjectURL(blob);
  const touchScreen = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
  const opened = !forceDownload && !touchScreen && window.open(url, "_blank");
  if (opened) return;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

/** What a letter's row wears while it is on its way between the two pens. */
const STATUS: Record<LetterRow["status"], { label: string; className: string }> = {
  pending_pastor: { label: "With the pastor", className: "bg-purple-50 text-purple-800" },
  pastor_signed: { label: "With the clerk", className: "bg-mist-select text-bark" },
  completed: { label: "Fully signed", className: "bg-green-50 text-green-800" },
  declined: { label: "Declined", className: "bg-red-50 text-red-700" },
};

export function DepartmentLettersPanel({
  department,
  // A desk whose work is the signature — the pastorate's — is never also the
  // desk that writes: there, the button and the compose modal simply are not
  // offered, and the empty state says where the letter comes from.
  canCompose = true,
  className = "shrink-0 overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm",
}: {
  /** The area whose letters these are — the panel is always read for one desk. */
  department: { code: string; label: string };
  /** Whether this reader's desk may raise a letter of its own. */
  canCompose?: boolean;
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
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  // The letter being signed, and whose signature it is waiting for.
  const [signing, setSigning] = useState<{ row: LetterRow; action: "pastor_sign" | "clerk_sign" | "decline" } | null>(null);
  const [savingSignature, setSavingSignature] = useState(false);
  // The signer's own saved signature, read when the modal opens so the paper
  // shows what the pen will actually put on it.
  const [mySignature, setMySignature] = useState<{ url: string; office: string; name: string } | null>(null);
  const [pdfId, setPdfId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/api/members/department-letters/?department=${encodeURIComponent(department.code)}`, {
      headers: authHeaders(),
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLetters(Array.isArray(data) ? data : []))
      .catch(() => setLetters([]))
      .finally(() => setLoading(false));
  }, [department.code]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const openCompose = () => {
    setTitle("");
    setContent("");
    setComposing(true);
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    try {
      const response = await fetch(`${API_URL}/api/members/department-letters/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ department: department.code, title: title.trim(), content: content.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.title || data.content || "The letter could not be sent.");
      setComposing(false);
      showAlert(
        "Letter sent",
        "It is on the church letterhead with the pastor now — the clerk signs after them, and it comes back to you fully signed.",
        "success"
      );
      load();
    } catch (error) {
      showAlert("Could not send the letter", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSending(false);
    }
  };

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

  /** Read the sheet while it travels; hand it over to keep once it is signed. */
  const openPdf = async (row: LetterRow) => {
    if (pdfId !== null) return;
    setPdfId(row.id);
    try {
      const response = await fetch(`${API_URL}/api/members/department-letters/${row.id}/pdf/`, {
        headers: authHeaders(),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "That letter could not be opened.");
      }
      deliverPdf(await response.blob(), `Letter_${row.department_code}_${row.id}.pdf`, row.status === "completed");
    } catch (error) {
      showAlert("Could not open the letter", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setPdfId(null);
    }
  };

  return (
    <section className={className}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-line bg-sand/20 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-xs font-bold uppercase tracking-wide text-bark">Letters</h2>
          <p className="truncate text-[11px] text-moss">
            Written here, signed by the pastor then the clerk, and returned fully signed for stamping.
          </p>
        </div>
        {canCompose && (
          <button
            type="button"
            onClick={openCompose}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-ember-deep"
          >
            <PenLine className="h-3.5 w-3.5" />
            Write letter
          </button>
        )}
      </header>

      <div className={`custom-hover-scrollbar overflow-y-auto ${letters.length > 0 ? "max-h-64" : ""}`}>
        {loading ? (
          <p className="px-4 py-6 text-center text-xs text-moss">Loading the letters…</p>
        ) : letters.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-6 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sand text-ember">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-2 text-sm font-semibold text-bark">No letters yet</p>
            <p className="mt-0.5 max-w-sm text-xs text-moss">
              {canCompose
                ? "Write one and it goes to the pastor for signature, then the clerk, and comes back here fully signed."
                : "Letters written on this desk arrive here to be signed or sent back with a reason — this desk writes none of its own."}
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

      {/* Compose — title and body, the two things a letter is made of. */}
      {composing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={send}
            role="dialog"
            aria-modal="true"
            aria-label="Write a letter"
            className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-sand-line"
          >
            <div className="flex items-start justify-between gap-3 border-b border-sand-line px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-bark">Write a letter</h3>
                <p className="mt-0.5 text-xs text-moss">
                  It goes on the church letterhead to the pastor, then the clerk, and comes back to you fully signed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComposing(false)}
                aria-label="Close"
                className="rounded-lg p-1 text-moss transition hover:bg-sand hover:text-bark"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <label className="block text-sm font-medium text-bark">
                Title *
                <input
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Request for choir robes"
                  autoFocus
                  className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
                />
              </label>
              <label className="block text-sm font-medium text-bark">
                Letter *
                <textarea
                  required
                  rows={9}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Write the letter here — the body as it should read on the page…"
                  className="mt-1 block w-full resize-y rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-ember"
                />
              </label>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-sand-line px-5 py-3">
              <button
                type="button"
                onClick={() => setComposing(false)}
                className="rounded-xl border border-sand-mute px-4 py-2 text-xs font-semibold text-moss transition hover:text-bark"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending || !title.trim() || !content.trim()}
                className="rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send for signature"}
              </button>
            </div>
          </form>
        </div>
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
