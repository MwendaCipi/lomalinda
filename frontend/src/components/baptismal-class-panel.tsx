"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Printer, Search, Trash2, UserPlus, X } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { dayFirst } from "@/lib/dates";
import { RecordList } from "@/components/record-list";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One candidate on the register, as the desk's own endpoint reports them. */
type BaptismalRow = {
  id: number;
  name: string;
  status: string;
  status_display: string;
  note: string;
  added_by_name: string;
  baptized_on: string | null;
};

/** One name-match from the roll's search — a pick, never a contact card. */
type NameMatch = { id: number; name: string };

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Lesson classes: who the school is preparing for the font.
 *
 * Adding opens a sheet that searches the roll as the elder types — a tap
 * picks the member — while a candidate who has no account yet is written in
 * by name, because baptism is not held back by having no login. The walk
 * (preparing → ready → baptised) sits in each row's actions; baptising stamps
 * the day, and walking back clears it. Removing takes the row with no
 * ceremony, and the foot carries the page's two buttons.
 */
export function BaptismalClassPanel() {
  const [entries, setEntries] = useState<BaptismalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [rawMatches, setRawMatches] = useState<NameMatch[]>([]);
  const [picked, setPicked] = useState<NameMatch | null>(null);
  // The picker only shows results while a search is actually under way: a
  // picked member, or a term too short to mean anything, reads as no list —
  // derived at render rather than cleared by the effect below.
  const matches = picked || query.trim().length < 2 ? [] : rawMatches;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // The add sheet — the page's one write, opened over the register rather
  // than standing above it and pushing the class off the screen.
  const [showAddModal, setShowAddModal] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/members/baptismal-class/`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as { entries: BaptismalRow[] };
      setEntries(data.entries || []);
    } catch {
      /* the list keeps what it had */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(async () => {
      if (!alive) return;
      await reload();
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  // The picker searches as the elder types, two letters minimum — the same
  // read the gift form's person field uses.
  useEffect(() => {
    const term = query.trim();
    if (picked || term.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      fetch(`${API_URL}/api/members/lookup/names/?q=${encodeURIComponent(term)}`, { headers: authHeaders() })
        .then((res) => (res.ok ? res.json() : { matches: [] }))
        .then((data) => {
          if (alive) setRawMatches(Array.isArray(data?.matches) ? data.matches : []);
        })
        .catch(() => {
          if (alive) setRawMatches([]);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, picked]);

  const resetForm = () => {
    setQuery("");
    setPicked(null);
    setRawMatches([]);
    setNote("");
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const add = async () => {
    const term = picked ? picked.name : query.trim();
    if (!term || busy) return;
    setBusy(true);
    try {
      const body = picked ? { member_id: picked.id, note: note.trim() } : { guest_name: term, note: note.trim() };
      const res = await fetch(`${API_URL}/api/members/baptismal-class/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "The candidate could not be added.");
      showAlert("Added to the class", `${term} is on the lesson classes register.`, "success", {
        toast: true,
        timer: 4000,
        showConfirmButton: false,
      });
      resetForm();
      setShowAddModal(false);
      await reload();
    } catch (error) {
      showAlert("Could not add", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const walk = async (row: BaptismalRow, next: string) => {
    try {
      const res = await fetch(`${API_URL}/api/members/baptismal-class/${row.id}/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "The entry could not be updated.");
      }
      await reload();
    } catch (error) {
      showAlert("Could not update", error instanceof Error ? error.message : "Try again.", "error");
    }
  };

  const remove = async (row: BaptismalRow) => {
    try {
      const res = await fetch(`${API_URL}/api/members/baptismal-class/${row.id}/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ remove: true }),
      });
      if (!res.ok) throw new Error("The name could not be taken off.");
      await reload();
    } catch (error) {
      showAlert("Could not remove", error instanceof Error ? error.message : "Try again.", "error");
    }
  };

  /** The register in the browser's print dialog: every candidate on the roll,
      with the step they stand at and the day they came up from the font. */
  const printClass = () => {
    const escape = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = entries
      .map((row, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escape(row.name)}</td>
        <td>${escape(row.status_display)}</td>
        <td>${row.baptized_on ? new Date(row.baptized_on).toLocaleDateString() : "—"}</td>
        <td>${escape(row.added_by_name || "—")}</td>
        <td>${escape(row.note || "—")}</td>
      </tr>`)
      .join("");
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(`<!doctype html><html><head><title>Lesson Classes</title><style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;color:#28201c;margin:32px}
      h1{font-size:22px;margin:0 0 4px}
      p{color:#665a4f;font-size:11px;margin:0 0 18px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{text-align:left;border-bottom:2px solid #8c4c2f;padding:8px 6px;text-transform:uppercase;font-size:9px;color:#665a4f}
      td{border-bottom:1px solid #e6ddd5;padding:8px 6px;vertical-align:top}
      @media print{body{margin:16px}}
    </style></head><body>
      <h1>Lesson Classes</h1>
      <p>${entries.length} candidate${entries.length === 1 ? "" : "s"} · Printed ${new Date().toLocaleDateString()}</p>
      <table><thead><tr>
        <th>#</th><th>Candidate</th><th>Status</th><th>Baptised</th><th>Added by</th><th>Note</th>
      </tr></thead><tbody>${rows || `<tr><td colspan="6">No candidates on the register.</td></tr>`}</tbody></table>
    </body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const stepLabel = (step: string) =>
    step === "preparing" ? "Back to preparing" : step === "ready" ? "Mark ready" : "Mark baptised";

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="rounded-2xl border border-sand-line bg-white py-10 text-center text-xs text-moss">
          Loading the lesson classes…
        </p>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand-line bg-sand-linen/40 p-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-moss-faint" aria-hidden="true" />
          <p className="mt-2 text-xs font-medium text-moss">No one is in the lesson classes yet.</p>
          <p className="mt-1 text-[11px] text-moss-faint">
            Use &ldquo;Add candidate&rdquo; below to enroll the first member.
          </p>
        </div>
      ) : (
        <RecordList
          rows={entries}
          loading={false}
          rowKey={(row) => row.id}
          loadingLabel="Loading the lesson classes…"
          headers={[
            { label: "Candidate", className: "px-4 py-3" },
            { label: "Status", className: "px-4 py-3" },
            { label: "Baptised", className: "px-4 py-3" },
            { label: "Added by", className: "px-4 py-3" },
            { label: "Actions", className: "px-4 py-3 text-center" },
          ]}
          tableWrapperClassName="overflow-x-auto rounded-2xl border border-sand-line bg-white"
          tableClassName="w-full text-left text-xs"
          headClassName="border-b border-sand-line bg-sand/60"
          headRowClassName="text-[11px] font-bold uppercase tracking-wider text-ember"
          headCellClassName="font-bold"
          renderRow={(row) => (
            <tr key={row.id} className="align-top transition hover:bg-sand-linen/50">
              <td className="min-w-[180px] px-4 py-3">
                <span className="block font-semibold text-bark">{row.name}</span>
                {row.note && <span className="mt-0.5 block text-[11px] text-moss">{row.note}</span>}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-semibold text-bark">
                  {row.status_display}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-moss">
                {row.baptized_on ? dayFirst(row.baptized_on) : "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-moss">{row.added_by_name || "—"}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {(["preparing", "ready", "baptised"] as const).map((step) =>
                    row.status === step ? null : (
                      <button
                        key={step}
                        type="button"
                        onClick={() => void walk(row, step)}
                        className="whitespace-nowrap rounded-lg border border-sand-line bg-white px-2.5 py-1 text-[10px] font-semibold text-bark transition hover:border-ember hover:text-ember"
                      >
                        {stepLabel(step)}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => void remove(row)}
                    aria-label={`Remove ${row.name} from the class`}
                    title="Remove from the class"
                    className="rounded-lg p-1.5 text-moss transition hover:bg-alert-wash hover:text-alert"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          )}
          renderCard={(row) => (
            <div key={row.id} className="space-y-2 rounded-xl border border-sand-line bg-white p-3.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-bark">{row.name}</p>
                  <p className="text-[11px] text-moss">
                    {row.baptized_on ? `Baptised ${dayFirst(row.baptized_on)}` : "Not yet baptised"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-sand px-2 py-0.5 text-[10px] font-semibold text-bark">
                  {row.status_display}
                </span>
              </div>
              {row.note && <p className="text-[11px] leading-relaxed text-moss">{row.note}</p>}
              {row.added_by_name && (
                <p className="text-[11px] text-moss-faint">Added by {row.added_by_name}</p>
              )}
              <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-sand-line pt-2">
                {(["preparing", "ready", "baptised"] as const).map((step) =>
                  row.status === step ? null : (
                    <button
                      key={step}
                      type="button"
                      onClick={() => void walk(row, step)}
                      className="rounded-lg border border-sand-line bg-white px-2.5 py-1 text-[10px] font-semibold text-bark transition hover:border-ember hover:text-ember"
                    >
                      {stepLabel(step)}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => void remove(row)}
                  aria-label={`Remove ${row.name} from the class`}
                  className="rounded-lg p-1.5 text-moss transition hover:bg-alert-wash hover:text-alert"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
          cardsClassName="grid gap-3 md:hidden"
        />
      )}

      {/* The page's actions across the bottom of the register, centred. */}
      <div className="page-actions">
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-sand-line bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-moss">
            Showing <strong className="text-bark">{entries.length}</strong>{" "}
            {entries.length === 1 ? "candidate" : "candidates"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={printClass}
              disabled={entries.length === 0}
              className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-sand-mute bg-white px-3.5 text-xs font-semibold text-bark transition hover:border-ember disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print class
            </button>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-ember px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add candidate
            </button>
          </div>
        </div>
      </div>

      {/* The add sheet */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowAddModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add a candidate to the lesson classes"
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-sand-line"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sand-line px-5 pb-3 pt-5">
              <div>
                <h3 className="flex items-center gap-1.5 text-base font-bold text-bark">
                  <UserPlus className="h-4 w-4 text-ember" aria-hidden="true" />
                  Add a candidate
                </h3>
                <p className="mt-0.5 text-[11px] text-moss">
                  Search the roll, or write in a name for someone without an account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
                className="text-moss transition hover:text-bark"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void add();
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                <div>
                  <label htmlFor="candidate-name" className="block text-xs font-semibold text-bark">
                    Candidate
                  </label>
                  <div className="relative mt-1.5">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moss"
                      aria-hidden="true"
                    />
                    <input
                      id="candidate-name"
                      autoFocus
                      type="text"
                      value={picked ? picked.name : query}
                      onChange={(event) => {
                        setPicked(null);
                        setQuery(event.target.value);
                      }}
                      placeholder="Search the roll, or type a name"
                      className="w-full rounded-xl border border-sand-line bg-white py-2.5 pl-8 pr-3 text-xs focus:border-ember focus:outline-none"
                    />
                  </div>
                  {matches.length > 0 && (
                    <ul className="mt-1.5 divide-y divide-sand-line overflow-hidden rounded-xl border border-sand-line bg-white">
                      {matches.map((match) => (
                        <li key={match.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setPicked(match);
                              setRawMatches([]);
                            }}
                            className="w-full px-3 py-2 text-left text-xs font-semibold text-bark transition hover:text-ember"
                          >
                            {match.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <label htmlFor="candidate-note" className="block text-xs font-semibold text-bark">
                    Note (optional)
                  </label>
                  <input
                    id="candidate-note"
                    type="text"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="e.g. studying weekly"
                    className="mt-1.5 w-full rounded-xl border border-sand-line bg-white px-3 py-2.5 text-xs focus:border-ember focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-sand-line bg-sand-linen/40 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-sand-line bg-white px-3.5 py-2 text-xs font-semibold text-moss transition hover:text-bark"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || (!picked && !query.trim())}
                  className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  {busy ? "Adding…" : "Add to the class"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
