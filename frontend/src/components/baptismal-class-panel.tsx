"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, UserPlus, Trash2 } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { dayFirst } from "@/lib/dates";

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
 * The baptismal class: who the elders are preparing for the font.
 *
 * Adding searches the roll as the elder types — a tap picks the member —
 * while a candidate who has no account yet is written in by name, because
 * baptism is not held back by having no login. The walk (preparing → ready
 * → baptised) is one select on each row; baptising stamps the day, and
 * walking back clears it. Removing takes the row with no ceremony.
 */
export function BaptismalClassPanel() {
  const [entries, setEntries] = useState<BaptismalRow[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<NameMatch[]>([]);
  const [picked, setPicked] = useState<NameMatch | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/members/baptismal-class/`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as { entries: BaptismalRow[] };
      setEntries(data.entries || []);
    } catch {
      /* the list keeps what it had */
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
    if (picked || term.length < 2) {
      setMatches([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      fetch(`${API_URL}/api/members/lookup/names/?q=${encodeURIComponent(term)}`, { headers: authHeaders() })
        .then((res) => (res.ok ? res.json() : { matches: [] }))
        .then((data) => {
          if (alive) setMatches(Array.isArray(data?.matches) ? data.matches : []);
        })
        .catch(() => {
          if (alive) setMatches([]);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, picked]);

  const add = async () => {
    const term = query.trim();
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
      showAlert("Added to the class", `${picked ? picked.name : term} is on the baptismal class.`, "success", {
        toast: true,
        timer: 4000,
        showConfirmButton: false,
      });
      setQuery("");
      setPicked(null);
      setMatches([]);
      setNote("");
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

  return (
    <div className="flex flex-col">
      {/* One field does both jobs: a roll pick, or a plain name for a
          candidate without an account. */}
      <div className="rounded-xl border border-sand-line bg-sand p-3">
        <label className="block text-xs font-semibold text-bark">Add a candidate</label>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moss" aria-hidden="true" />
          <input
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
                    setMatches([]);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-bark transition hover:text-ember"
                >
                  {match.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Note (optional) — e.g. studying weekly"
          className="mt-2 w-full rounded-xl border border-sand-line bg-white px-3 py-2.5 text-xs focus:border-ember focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || (!picked && !query.trim())}
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          {busy ? "Adding…" : "Add to the class"}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-xs text-moss">
          No one is on the baptismal class yet. Add members as they begin studying.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {entries.map((row) => (
            <li key={row.id} className="rounded-xl border border-sand-line bg-sand-linen px-3.5 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-bark">{row.name}</p>
                  {row.note && <p className="mt-0.5 text-[11px] text-moss">{row.note}</p>}
                  <p className="mt-0.5 text-[11px] text-moss">
                    {row.status_display}
                    {row.baptized_on ? ` · baptized ${dayFirst(row.baptized_on)}` : ""}
                    {row.added_by_name ? ` · added by ${row.added_by_name}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(row)}
                  aria-label={`Remove ${row.name} from the class`}
                  className="shrink-0 rounded-lg p-2 text-moss transition hover:bg-white hover:text-ember"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(["preparing", "ready", "baptised"] as const).map((step) =>
                  row.status === step ? null : (
                    <button
                      key={step}
                      type="button"
                      onClick={() => void walk(row, step)}
                      className="rounded-lg border border-sand-line bg-white px-2.5 py-1 text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember"
                    >
                      {step === "preparing" ? "Back to preparing" : step === "ready" ? "Mark ready" : "Mark baptised"}
                    </button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
