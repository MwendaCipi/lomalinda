"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, PenLine, RefreshCw, X } from "lucide-react";

import { resolveAttachmentUrl } from "@/components/announcement-attachment";
import { showAlert } from "@/lib/alerts";
import { dayFirst } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type SignatureRequest = {
  id: number;
  signing_id: number;
  kind: "givings_summary" | "givings_individual" | "requests" | "withdrawal_request";
  kind_label: string;
  title: string;
  period_start: string | null;
  period_end: string | null;
  details: string;
  office: string;
  office_label: string;
  office_title: string;
  status: "pending" | "signed" | "rejected";
  response: string;
  responded_by_name: string;
  responded_at: string | null;
  created_at: string;
  can_respond: boolean;
};

function periodLabel(row: SignatureRequest): string {
  if (!row.period_start && !row.period_end) return "The whole book";
  const start = row.period_start ? dayFirst(row.period_start) : "The beginning";
  const end = row.period_end ? dayFirst(row.period_end) : "today";
  return `${start} – ${end}`;
}

function badgeStyle(status: SignatureRequest["status"]): string {
  if (status === "signed") return "bg-green-50 text-green-800";
  if (status === "rejected") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-800";
}

function badgeLabel(row: SignatureRequest): string {
  if (row.status === "signed") return "Signed";
  if (row.status === "rejected") return "Sent back";
  return row.can_respond ? "Your signature" : `With the ${row.office_title}`;
}

/**
 * The signature asks a report raises, as one queue.
 *
 * The treasury sends a report round the offices; each office's current holder
 * reads the ask here, signs it with the signature kept on their profile, or
 * sends the paper back with a reason. The report is complete only when every
 * office has signed. The sending desk also sees every office's answer, so it
 * can follow the paper after the send has left the screen.
 */
export function ReportSigningsPanel({ className = "" }: { className?: string }) {
  const [rows, setRows] = useState<SignatureRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<{ row: SignatureRequest; action: "sign" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [signature, setSignature] = useState<{ url: string; office: string; name: string } | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/members/reports/signings/`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.requests)) {
        setRows(data.requests as SignatureRequest[]);
      } else if (!quiet) {
        setRows([]);
      }
    } catch {
      if (!quiet) setRows([]);
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // The first read is deferred by a microtask, the idiom the other panels
    // use, so the fetch is not started in the effect's own synchronous body.
    void Promise.resolve().then(() => load());
  }, [load]);

  const open = async (row: SignatureRequest, action: "sign" | "reject") => {
    setActive({ row, action });
    setNote("");
    setSignature(null);
    if (action !== "sign") return;
    try {
      const res = await fetch(`${API_URL}/api/members/me/`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSignature({
          url: typeof data?.signature_url === "string" ? data.signature_url : "",
          office: typeof data?.signature_office === "string" ? data.signature_office : "",
          name: typeof data?.name === "string" ? data.name : "",
        });
      }
    } catch {
      // Without the preview the signing still works: the paper prints the
      // signature saved on the profile, not this reading of it.
    }
  };

  const submit = async () => {
    if (!active || saving) return;
    const reason = note.trim();
    if (active.action === "reject" && !reason) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/members/reports/signings/${active.row.id}/respond/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action: active.action, response: reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "The answer could not be saved.");
      const action = active.action;
      const fullySigned = data.signing_status === "signed";
      setActive(null);
      setNote("");
      showAlert(
        action === "reject" ? "Report sent back" : fullySigned ? "Report fully signed" : "Signature recorded",
        action === "reject"
          ? "The desk has your reason. No signature was put on the paper."
          : fullySigned
            ? "Every office has signed. The report is complete."
            : "Your signature is on the report. The other offices still have it.",
        "success",
      );
      await load(true);
    } catch (error) {
      showAlert(
        active.action === "reject" ? "Could not send it back" : "Could not sign the report",
        error instanceof Error ? error.message : "Try again.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  // An empty queue is no queue at all: a member with no office pen should not
  // meet a card explaining that there is nothing for them here.
  if (!loaded || rows.length === 0) return null;

  const ordered = [
    ...rows.filter((row) => row.status === "pending" && row.can_respond),
    ...rows.filter((row) => row.status === "pending" && !row.can_respond),
    ...rows.filter((row) => row.status !== "pending"),
  ];

  return (
    <section className={`overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm ${className}`}>
      <header className="flex items-start justify-between gap-3 border-b border-sand-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-bark">
            <FileText className="h-4 w-4 text-ember" aria-hidden="true" />
            Report signatures
          </h2>
          <p className="mt-0.5 text-[11px] text-moss">
            Reports the treasury has sent for an office&apos;s signature — sign, or send the paper back with a reason.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-label="Refresh report signatures"
          title="Refresh report signatures"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-sand-mute bg-white text-moss transition hover:border-ember hover:text-ember disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
        </button>
      </header>

      <ul className="divide-y divide-sand-soft">
        {ordered.map((row) => (
          <li key={row.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-bark">{row.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-moss">
                  {row.kind_label} · {periodLabel(row)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeStyle(row.status)}`}
              >
                {badgeLabel(row)}
              </span>
            </div>

            {row.details && <p className="mt-1 text-xs text-moss">{row.details}</p>}
            <p className="mt-1 text-[11px] text-moss-faint">
              {row.office_label} · sent {dayFirst(row.created_at)}
              {row.responded_by_name ? ` · ${row.responded_by_name}` : ""}
            </p>
            {row.response && (
              <p className="mt-1 text-[11px] italic text-moss">&quot;{row.response}&quot;</p>
            )}

            {row.status === "pending" && row.can_respond && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => void open(row, "sign")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-bark px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-bark/90"
                >
                  <PenLine className="h-3 w-3" aria-hidden="true" />
                  Sign this report
                </button>
                <button
                  type="button"
                  onClick={() => void open(row, "reject")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sand-mute bg-white px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:border-red-400 hover:text-red-600"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                  Send it back
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={active.action === "sign" ? "Sign this report" : "Send this report back"}
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-sand-line"
          >
            <div className="flex items-start justify-between gap-3 border-b border-sand-line px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-bark">
                  {active.action === "sign" ? "Sign this report" : "Send this report back"}
                </h3>
                <p className="mt-0.5 truncate text-xs text-moss">
                  {active.row.title} · {active.row.office_title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label="Close"
                className="rounded-lg p-1 text-moss transition hover:bg-sand hover:text-bark"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <div className="rounded-xl border border-sand-line bg-sand-plate p-3 text-xs">
                <p className="font-bold text-bark">{active.row.title}</p>
                <p className="mt-0.5 text-[11px] text-moss">
                  {active.row.kind_label} · {periodLabel(active.row)}
                </p>
                {active.row.details && <p className="mt-1.5 text-moss">{active.row.details}</p>}
                <p className="mt-1.5 text-[11px] text-moss-faint">
                  {active.row.office_label} · {active.row.office_title}
                </p>
              </div>

              {active.action === "reject" ? (
                <div className="rounded-xl border border-sand-line p-3">
                  <label
                    htmlFor="report-signature-reject"
                    className="block text-[11px] font-bold uppercase tracking-wide text-moss"
                  >
                    Reason for sending it back
                  </label>
                  <textarea
                    id="report-signature-reject"
                    rows={4}
                    maxLength={1000}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Why is the report going back? The treasury reads this word for word."
                    autoFocus
                    className="mt-1.5 block w-full resize-y rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
                  />
                  <p className="mt-1.5 text-[11px] text-moss-faint">
                    Sending it back puts no signature on the paper — the report returns to the treasury with your reason.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-sand-line p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-moss">Your signature</p>
                    {signature?.url ? (
                      <div className="mt-2 flex h-16 items-end justify-center rounded-lg border border-sand-line bg-white px-4 pb-1">
                        {/* Plain img: the signature is a same-origin upload. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveAttachmentUrl(signature.url)}
                          alt={signature.office || "Your saved signature"}
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
                      {signature?.name ? `${signature.name} · ` : ""}
                      Signing records you as the {active.row.office_title.toLowerCase()} who cleared it, and the sheet
                      carries your saved signature.
                    </p>
                  </div>

                  <div className="rounded-xl border border-sand-line p-3">
                    <label
                      htmlFor="report-signature-note"
                      className="block text-[11px] font-bold uppercase tracking-wide text-moss"
                    >
                      Notes <span className="font-normal normal-case tracking-normal">(optional)</span>
                    </label>
                    <textarea
                      id="report-signature-note"
                      rows={3}
                      maxLength={1000}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Anything the treasury should read with this signature…"
                      className="mt-1.5 block w-full resize-y rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-sand-line px-5 py-3">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded-xl border border-sand-mute bg-sand px-4 py-2 text-xs font-semibold text-bark transition hover:bg-sand-line"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving || (active.action === "reject" && !note.trim())}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white transition disabled:opacity-60 ${
                  active.action === "reject" ? "bg-ember hover:bg-ember-deep" : "bg-bark hover:bg-bark/90"
                }`}
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {saving
                  ? active.action === "reject"
                    ? "Sending back…"
                    : "Signing…"
                  : active.action === "reject"
                    ? "Send it back"
                    : "Sign this report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
