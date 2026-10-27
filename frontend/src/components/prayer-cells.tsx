"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MessageSquare, Search, Trash2, UserPlus, X } from "lucide-react";

import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Who keeps the cells on their own desk. */
const DESK_NAME = "Personal Ministries";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** One member's place in a cell, as the API reports it. */
type CellMember = { member_id: number; name: string };

/** One prayer cell, as both the fellowship page and the desk read it. */
type PrayerCell = {
  id: number;
  name: string;
  description: string;
  leader: { id: number; name: string } | null;
  members: CellMember[];
  room_id: number | null;
};

/** The reader's own asks, as the fellowship page reads them. */
type MyRequest = { id: number; cell_id: number; cell_name: string; status: string; reply: string };

/** The desk materialised: the register plus who may write to it. */
type Register = {
  cells: PrayerCell[];
  my_cells: number[];
  my_requests: MyRequest[];
  can_manage: boolean;
};

/** A desk-visible ask to join, as the review queue reads it. */
type DeskRequest = {
  id: number;
  cell_id: number;
  cell_name: string;
  member_id: number;
  member_name: string;
  member_email: string;
  note: string;
  status: string;
};

/**
 * The detail the endpoint names when a request is refused, so the caller
 * can read the one field the desk wrote — both shapes the API answers with.
 */
async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  for (const key of ["detail", "name"]) {
    const value = data[key];
    if (typeof value === "string" && value) return value;
  }
  if (data.cell_id) return "Choose the cell you are asking to join.";
  return "The request could not be sent.";
}

function loadRegister(): Promise<Register> {
  return fetch(`${API_URL}/api/members/prayer-cells/`, { headers: authHeaders() })
    .then(async (res) => {
      if (!res.ok) return EMPTY_REGISTER;
      return (await res.json()) as Register;
    })
    .catch(() => EMPTY_REGISTER);
}

const EMPTY_REGISTER: Register = { cells: [], my_cells: [], my_requests: [], can_manage: false };

/* ── Duty: the two actions in flight, tracked per cell ──────────────────── */

type Busy = { cellId: number; action: "ask" | "add" | "remove" } | null;

/* ── Members' side: the fellowship page's Prayer Cells view ────────────── */

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "◦";
}

function MemberChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sand px-2.5 py-1 text-[11px] font-medium text-moss">
      <span className="grid h-4 w-4 place-items-center rounded-full bg-ember/15 text-[8px] font-bold text-ember">
        {initialsOf(name)}
      </span>
      {name}
    </span>
  );
}

/**
 * The fellowship's Prayer Cells: the church's small companies of prayer, read
 * by every member. Being in one lights the way to its chat; not being in one,
 * the ask to join rides the card. The desk's own view rides the Personal
 * Ministries strip (see `PrayerCellsDesk`).
 */
export function PrayerCellsHub() {
  const [register, setRegister] = useState<Register | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const reload = useCallback(async () => {
    setRegister(await loadRegister());
  }, []);

  // The read rides the same microtask idiom the calendar and requests pages
  // use, so the effect body stays free of async work the compiler can trip on.
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

  const ask = async (cell: PrayerCell) => {
    setBusy({ cellId: cell.id, action: "ask" });
    try {
      const res = await fetch(`${API_URL}/api/members/prayer-cells/${cell.id}/requests/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await readError(res));
      showAlert("Request sent", 'Your ask is with the cell. The desk will follow up.', "success", {
        toast: true,
        timer: 4500,
        showConfirmButton: false,
      });
      await reload();
    } catch (error) {
      showAlert("Not sent", error instanceof Error ? error.message : "The ask could not be sent.", "error");
    } finally {
      setBusy(null);
    }
  };

  const myRequestFor = useCallback(
    (cellId: number): MyRequest | null =>
      register?.my_requests.find((row) => row.cell_id === cellId && row.status === "pending") ?? null,
    [register]
  );

  if (!register) {
    return (
      <div className="flex justify-center p-12 text-moss">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  const { cells, my_cells, can_manage } = register;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sand-line bg-white p-5">
        <h2 className="text-lg font-bold text-bark">Prayer Cells</h2>
        <p className="mt-1 text-sm text-moss">
          Small companies of members who pray together. Find one below and ask to join — the desk will follow up, and
          the cell&apos;s own chat opens when you are in.
        </p>
      </div>

      {cells.length === 0 && (
        <p className="rounded-2xl border border-sand-line bg-white p-5 text-sm text-moss">
          No cell is registered yet — the desks will form the first ones, and they will open here.
        </p>
      )}

      {cells.map((cell) => {
        const mine = my_cells.includes(cell.id);
        const pending = myRequestFor(cell.id);
        return (
          <div key={cell.id} className="rounded-2xl border border-sand-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-bark">{cell.name}</h3>
                {cell.description && <p className="mt-0.5 text-xs text-moss">{cell.description}</p>}
                {cell.leader && (
                  <p className="mt-0.5 text-xs text-moss">
                    Led by <span className="font-semibold text-bark">{cell.leader.name}</span>
                  </p>
                )}
              </div>
              {mine && cell.room_id ? (
                <Link
                  href={`/chat?group=${cell.room_id}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-ember px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Open chat
                </Link>
              ) : null}
            </div>
            {cell.members.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {cell.members.map((member) => (
                  <MemberChip key={`${cell.id}-${member.member_id}`} name={member.name} />
                ))}
              </div>
            )}
            {!mine && (
              <div className="mt-3">
                {pending ? (
                  <p className="text-xs font-medium text-moss">Your ask is waiting with the cell.</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void ask(cell)}
                    disabled={busy?.cellId === cell.id && busy.action === "ask"}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-ember/40 px-3.5 py-2 text-xs font-semibold text-ember transition hover:bg-ember/5 disabled:opacity-50"
                  >
                    {busy?.cellId === cell.id && busy.action === "ask" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                    Ask to join
                  </button>
                )}
              </div>
            )}
            {mine && <p className="mt-3 text-xs font-medium text-ember">You are in this cell.</p>}
          </div>
        );
      })}

      {can_manage && (
        <p className="rounded-2xl bg-sand p-5 text-xs text-moss">
          You keep the {DESK_NAME} desk: form cells, seat members and answer the asks from the desk&apos;s own Prayer
          Cells toggle.
        </p>
      )}
    </div>
  );
}

/* ── The desk's side: the Personal Ministries panel ─────────────────────── */

/** One name the roll search matched, for the seat-by-name pickers. */
type NameMatch = { id: number; name: string; phone: string };

async function searchNames(query: string): Promise<NameMatch[]> {
  if (query.trim().length < 2) return [];
  try {
    const res = await fetch(`${API_URL}/api/members/lookup/names/?q=${encodeURIComponent(query)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { matches: NameMatch[] };
    return data.matches ?? [];
  } catch {
    return [];
  }
}

/**
 * Seat a member by name: type, wait for matches, pick one — the same picker
 * the roll manager uses, so no second search UX is invented here.
 */
function NamePicker({
  onPick,
  busy,
  placeholder,
}: {
  onPick: (member: NameMatch) => void;
  busy: boolean;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<NameMatch[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(async () => {
      if (!alive) return;
      if (query.trim().length < 2) {
        setMatches([]);
        return;
      }
      setSearching(true);
      setMatches(await searchNames(query));
      setSearching(false);
    });
    return () => {
      alive = false;
    };
  }, [query]);

  const exact = matches.find((match) => match.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-sand-line bg-white px-3 py-2">
        <Search className="h-3.5 w-3.5 text-moss" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-xs text-bark outline-none placeholder:text-moss/70"
        />
      </div>
      {(matches.length > 0 || searching) && query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-sand-line bg-white shadow-sm">
          {searching && <p className="px-3 py-2 text-[11px] text-moss">Searching…</p>}
          {!searching && matches.length === 0 && <p className="px-3 py-2 text-[11px] text-moss">No member found.</p>}
          {matches.map((match) => (
            <button
              key={match.id}
              type="button"
              onClick={() => {
                onPick(match);
                setQuery("");
                setMatches([]);
              }}
              className="block w-full px-3 py-2 text-left text-xs text-bark transition hover:bg-sand"
            >
              {match.name}
            </button>
          ))}
        </div>
      )}
      {!searching && exact && (
        <p className="mt-1 text-[11px] text-moss">Press the name above to seat {exact.name}.</p>
      )}
      {busy && <Loader2 className="absolute right-3 top-3.5 h-3.5 w-3.5 animate-spin text-moss" aria-hidden="true" />}
    </div>
  );
}

/**
 * The Personal Ministries desk's Prayer Cells panel: the asks waiting with the
 * desk, then the register itself — cells formed here, their rolls kept here,
 * and every cell's chat room follows its roll (the server keeps the room in
 * step; the desk never touches chat).
 */
export function PrayerCellsDesk() {
  const [register, setRegister] = useState<Register | null>(null);
  const [deskRequests, setDeskRequests] = useState<DeskRequest[]>([]);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newLeader, setNewLeader] = useState<NameMatch | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<number, string>>({});
  // The roll panel is open on one cell at a time — the desk edits one roll.
  const [openRoll, setOpenRoll] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const [fresh, queue] = await Promise.all([
      loadRegister(),
      fetch(`${API_URL}/api/members/prayer-cells/requests/`, { headers: authHeaders() })
        .then(async (res) => (res.ok ? ((await res.json()) as { requests: DeskRequest[] }).requests : []))
        .catch(() => [] as DeskRequest[]),
    ]);
    setRegister(fresh);
    setDeskRequests(queue.filter((row) => row.status === "pending"));
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

  const act = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
      await reload();
    } catch (error) {
      showAlert("Not done", error instanceof Error ? error.message : "The change could not be made.", "error");
    } finally {
      setBusy(null);
    }
  };

  const formCell = async () => {
    const name = newName.trim();
    if (name.length < 3) {
      showAlert("A name first", "Give the cell a name of at least three characters.", "info");
      return;
    }
    await act("create", async () => {
      const res = await fetch(`${API_URL}/api/members/prayer-cells/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: newDescription.trim(),
          leader_id: newLeader?.id ?? null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setNewName("");
      setNewDescription("");
      setNewLeader(null);
      showAlert("Cell formed", "The prayer cell is on the register, and its chat is open.", "success", {
        toast: true,
        timer: 4500,
        showConfirmButton: false,
      });
    });
  };

  const answerRequest = async (row: DeskRequest, status: "approved" | "rejected") => {
    await act(`answer-${row.id}`, async () => {
      const res = await fetch(`${API_URL}/api/members/prayer-cells/requests/${row.id}/`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status, reply: replies[row.id] ?? "" }),
      });
      if (!res.ok) throw new Error(await readError(res));
    });
  };

  const addMember = async (cellId: number, match: NameMatch) => {
    await act(`member-${cellId}`, async () => {
      const res = await fetch(`${API_URL}/api/members/prayer-cells/${cellId}/members/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: match.id }),
      });
      if (!res.ok) throw new Error(await readError(res));
    });
  };

  const removeMember = async (cellId: number, memberId: number) => {
    await act(`member-${cellId}-${memberId}`, async () => {
      const res = await fetch(`${API_URL}/api/members/prayer-cells/${cellId}/members/${memberId}/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await readError(res));
    });
  };

  const retireCell = async (cellId: number) => {
    await act(`retire-${cellId}`, async () => {
      const res = await fetch(`${API_URL}/api/members/prayer-cells/${cellId}/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await readError(res));
    });
  };

  if (!register) {
    return (
      <div className="flex justify-center p-12 text-moss">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (!register.can_manage) {
    return (
      <p className="text-sm text-moss">The prayer cells are the Personal Ministries desk&apos;s to keep.</p>
    );
  }

  return (
    <div className="space-y-6">
      {/* The asks, answered first: a person is waiting. */}
      <section className="rounded-2xl border border-sand-line bg-white p-5">
        <h3 className="text-sm font-bold text-bark">Asks to join</h3>
        {deskRequests.length === 0 && (
          <p className="mt-1 text-xs text-moss">No ask is waiting right now.</p>
        )}
        <ul className="mt-2 space-y-2">
          {deskRequests.map((row) => (
            <li key={row.id} className="rounded-xl bg-sand p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-bark">
                    {row.member_name} <span className="font-normal text-moss">asks to join</span> {row.cell_name}
                  </p>
                  {row.note && <p className="mt-0.5 text-[11px] italic text-moss">“{row.note}”</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void answerRequest(row, "approved")}
                    disabled={busy === `answer-${row.id}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-ember px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void answerRequest(row, "rejected")}
                    disabled={busy === `answer-${row.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-sand-line px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:bg-white disabled:opacity-50"
                  >
                    <X className="h-3 w-3" /> Decline
                  </button>
                </div>
              </div>
              <input
                value={replies[row.id] ?? ""}
                onChange={(event) => setReplies({ ...replies, [row.id]: event.target.value })}
                placeholder="An optional word back to the member…"
                className="mt-2 w-full rounded-lg border border-sand-line bg-white px-3 py-1.5 text-xs outline-none focus:border-ember/40"
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Form a cell — the register's write. */}
      <section className="rounded-2xl border border-sand-line bg-white p-5">
        <h3 className="text-sm font-bold text-bark">Form a prayer cell</h3>
        <div className="mt-3 space-y-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Cell name — e.g. Oasis"
            className="w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-sm outline-none focus:border-ember/40"
          />
          <input
            value={newDescription}
            onChange={(event) => setNewDescription(event.target.value)}
            placeholder="A line about when and how they meet (optional)"
            className="w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-sm outline-none focus:border-ember/40"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <NamePicker
              onPick={(match) => setNewLeader(match)}
              busy={false}
              placeholder="Search a member to lead it (optional)…"
            />
            {newLeader && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-sand px-3 py-2 text-xs text-bark">
                <span className="truncate">Leader: {newLeader.name}</span>
                <button type="button" onClick={() => setNewLeader(null)} aria-label="Clear leader">
                  <X className="h-3.5 w-3.5 text-moss hover:text-ember" />
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void formCell()}
            disabled={busy === "create"}
            className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
          >
            {busy === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Form the cell
          </button>
        </div>
      </section>

      {/* The register: each cell and the roll the desk keeps. */}
      <section className="rounded-2xl border border-sand-line bg-white p-5">
        <h3 className="text-sm font-bold text-bark">The register</h3>
        {register.cells.length === 0 && (
          <p className="mt-1 text-xs text-moss">No cell on the register yet — form the first one above.</p>
        )}
        <div className="mt-2 space-y-3">
          {register.cells.map((cell) => (
            <div key={cell.id} className="rounded-xl border border-sand-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenRoll(openRoll === cell.id ? null : cell.id)}
                    className="text-sm font-semibold text-bark hover:text-ember"
                  >
                    {cell.name}
                  </button>
                  {cell.description && <p className="text-xs text-moss">{cell.description}</p>}
                  {cell.leader && (
                    <p className="mt-0.5 text-[11px] text-moss">Led by {cell.leader.name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {cell.room_id && (
                    <Link
                      href={`/chat?group=${cell.room_id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-sand px-2.5 py-1.5 text-[11px] font-medium text-moss transition hover:text-ember"
                    >
                      <MessageSquare className="h-3 w-3" /> Chat
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setOpenRoll(openRoll === cell.id ? null : cell.id);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-ember/10 px-2.5 py-1.5 text-[11px] font-semibold text-ember"
                  >
                    <UserPlus className="h-3 w-3" /> {openRoll === cell.id ? "Close roll" : "Roll & members"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void retireCell(cell.id)}
                    disabled={busy === `retire-${cell.id}`}
                    aria-label={`Retire ${cell.name} from the register`}
                    className="rounded-lg p-1.5 text-moss transition hover:text-ember disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {(openRoll === cell.id || busy?.startsWith(`member-${cell.id}`)) && (
                <div className="mt-3 border-t border-sand-line pt-3">
                  <div className="flex flex-wrap gap-1.5">
                    {cell.members.map((member) => (
                      <span
                        key={member.member_id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-sand px-2.5 py-1 text-[11px] font-medium text-bark"
                      >
                        {member.name}
                        <button
                          type="button"
                          onClick={() => void removeMember(cell.id, member.member_id)}
                          disabled={busy === `member-${cell.id}-${member.member_id}`}
                          aria-label={`Unseat ${member.name} from ${cell.name}`}
                          className="text-moss transition hover:text-ember disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {cell.members.length === 0 && (
                      <p className="text-[11px] text-moss">Nobody seated yet — search a name below.</p>
                    )}
                  </div>
                  <div className="mt-2 max-w-sm">
                    <NamePicker
                      onPick={(match) => void addMember(cell.id, match)}
                      busy={busy === `member-${cell.id}`}
                      placeholder="Search a member to seat…"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
