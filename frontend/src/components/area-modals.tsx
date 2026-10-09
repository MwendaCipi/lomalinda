"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function token(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}

/** The leadership contacts of one area, from the desk's own directory. */
type Holder = { name: string; role: string; email?: string; phone_number?: string };

/** The heading a join request is aimed at: Ministries or Departments. */
function headingToGroup(heading: string): "ministry" | "department" | null {
  if (heading.toLowerCase().startsWith("ministr")) return "ministry";
  if (heading.toLowerCase().startsWith("department")) return "department";
  return null;
}

export type AreaJoinModalProps = {
  open: boolean;
  /** The heading — "Ministries" or "Departments" — the ask is made under. */
  area: string | null;
  /** An area opened for: the picker arrives on it instead of a blank choice. */
  initialCode?: string | null;
  onClose: () => void;
};

/**
 * Ask to join an area of the church. The request lands with the department's
 * leader, its assistants and the elders' desk; the answer comes back to the
 * member's own rail. One modal serves both headings — the member picks the
 * area from a list of what the church actually runs — and an area's own page
 * opens it with that area already chosen.
 */
export function AreaJoinModal({ open, area, initialCode, onClose }: AreaJoinModalProps) {
  const [areas, setAreas] = useState<{ code: string; label: string }[]>([]);
  const [chosen, setChosen] = useState("");
  const [note, setNote] = useState("");
  // The two asks the modal carries: joining the area, or — on the music
  // desk — proposing a singing group for the leadership to register.
  const [askKind, setAskKind] = useState<"join" | "singing_group">("join");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setNote("");
    setAskKind("join");
    setGroupName("");
    setGroupDescription("");
    setChosen(initialCode ?? "");
    const t = token();
    if (!t) return;
    let alive = true;
    fetch(`${API_URL}/api/members/departments/`, { headers: { Authorization: `Bearer ${t}` } })
      .then((res) => (res.ok ? res.json() : { departments: [] }))
      .then((data) => {
        if (!alive) return;
        const group = headingToGroup(area ?? "");
        const rows = (data?.departments ?? []) as { code: string; label: string; group?: string }[];
        setAreas(rows.filter((r) => !group || r.group === group).map((r) => ({ code: r.code, label: r.label })));
      })
      .catch(() => setAreas([]));
    return () => {
      alive = false;
    };
    // Reopening with another area pre-chosen must reset the form to it.
  }, [open, area, initialCode]);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen) return;
    const proposing = chosen === "music" && askKind === "singing_group";
    if (proposing && groupName.trim().length < 3) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/members/department-join-requests/${chosen}/`, {
        method: "POST",
        headers: {
          ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          proposing
            ? { kind: "singing_group", group_name: groupName.trim(), group_description: groupDescription.trim(), note: note.trim() }
            : { kind: "join", note: note.trim() }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(Object.values(data).flat().join(" ") || "Unable to send your request.");
      showAlert("Request sent", data.detail || "Your request has been sent to the department's leadership.", "success");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send your request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="area-join-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line sm:p-8"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <h3 id="area-join-title" className="text-lg font-bold text-bark">
            Request to join {area?.toLowerCase() ?? "a ministry or department"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-moss hover:text-bark">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {error && <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
          <div>
            <label className="block text-xs font-semibold text-bark" htmlFor="area-join-select">
              Which ministry or department? *
            </label>
            <select
              id="area-join-select"
              required
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-sm focus:border-ember focus:outline-none"
            >
              <option value="">Choose a ministry or department…</option>
              {areas.map((a) => (
                <option key={a.code} value={a.code}>{a.label}</option>
              ))}
            </select>
          </div>
          {chosen === "music" && (
            <div>
              <span className="block text-xs font-semibold text-bark">What are you asking?</span>
              <div className="mt-1.5 flex gap-2">
                {([
                  { value: "join" as const, label: "Join the music desk" },
                  { value: "singing_group" as const, label: "Propose a singing group" },
                ]).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAskKind(option.value)}
                    aria-pressed={askKind === option.value}
                    className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      askKind === option.value
                        ? "bg-bark text-white shadow-sm"
                        : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chosen === "music" && askKind === "singing_group" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-bark" htmlFor="area-join-group-name">
                  Group name *
                </label>
                <input
                  id="area-join-group-name"
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="e.g. Praise Team"
                  className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-sm focus:border-ember focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-bark" htmlFor="area-join-group-about">
                  About the group (optional)
                </label>
                <textarea
                  id="area-join-group-about"
                  rows={2}
                  value={groupDescription}
                  onChange={(event) => setGroupDescription(event.target.value)}
                  placeholder="When they sing, what they lead, how they serve…"
                  className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-sm focus:border-ember focus:outline-none"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-semibold text-bark" htmlFor="area-join-note">
              A word about why (optional)
            </label>
            <textarea
              id="area-join-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Tell the leadership why you would like to serve here…"
              className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-sm focus:border-ember focus:outline-none"
            />
          </div>
          <p className="text-[11px] leading-5 text-moss">
            {chosen === "music" && askKind === "singing_group"
              ? "Your proposal goes to the music desk's leadership and the elders' desk. If it is approved, the group is registered and you are its first singer."
              : "Your request goes to the ministry or department&apos;s leader and assistants, and to the elders&apos; desk. When it is answered in church, the reply appears on your rail."}
          </p>
          <button
            type="submit"
            disabled={submitting || !chosen || (chosen === "music" && askKind === "singing_group" && groupName.trim().length < 3)}
            className="w-full rounded-xl bg-ember px-5 py-3 text-sm font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
          >
            {submitting ? "Sending…" : chosen === "music" && askKind === "singing_group" ? "Send proposal" : "Send request"}
          </button>
        </form>
      </div>
    </div>
  );
}

export type AreaContactModalProps = {
  open: boolean;
  area: string | null;
  onClose: () => void;
};

/**
 * How to reach an area's leadership: the names, phones and emails the desk's
 * own directory carries, so a member can simply ask a person.
 */
export function AreaContactModal({ open, area, onClose }: AreaContactModalProps) {
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHolders([]);
    setLoading(true);
    const t = token();
    if (!t) {
      setLoading(false);
      return;
    }
    let alive = true;
    fetch(`${API_URL}/api/members/departments/`, { headers: { Authorization: `Bearer ${t}` } })
      .then((res) => (res.ok ? res.json() : { departments: [] }))
      .then((data) => {
        if (!alive) return;
        const group = headingToGroup(area ?? "");
        const rows = (data?.departments ?? []) as {
          code: string;
          label: string;
          group?: string;
          roles?: { name?: string; holders?: { username?: string; kind?: string }[] }[];
        }[];
        // Every area under the heading with the people who lead it.
        const contacts: Holder[] = [];
        for (const dept of rows.filter((r) => !group || r.group === group)) {
          for (const role of dept.roles ?? []) {
            for (const holder of role.holders ?? []) {
              contacts.push({
                name: holder.username ?? "",
                role: `${dept.label} · ${role.name ?? ""}`.trim(),
                email: (holder as { email?: string }).email,
                phone_number: (holder as { phone_number?: string }).phone_number,
              });
            }
          }
        }
        setHolders(contacts);
      })
      .catch(() => setHolders([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, area]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="area-contact-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line sm:p-8"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <h3 id="area-contact-title" className="text-lg font-bold text-bark">
            Contact {area?.toLowerCase() ?? "a department"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-moss hover:text-bark">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          {loading && <p className="py-6 text-center text-xs text-moss">Loading contacts…</p>}
          {!loading && holders.length === 0 && (
            <p className="py-6 text-center text-xs text-moss">
              No leadership is seated yet. Ask at the office on Sabbath, or request to join and the desk will reach you.
            </p>
          )}
          {holders.map((holder, index) => (
            <div key={`${holder.name}-${index}`} className="rounded-2xl border border-sand-line bg-sand-linen p-4">
              <p className="text-sm font-bold text-bark">{holder.name}</p>
              <p className="text-[11px] text-moss">{holder.role}</p>
              <div className="mt-2 space-y-1 text-xs">
                {holder.phone_number && (
                  <a href={`tel:${holder.phone_number}`} className="block font-semibold text-ember hover:underline">
                    {holder.phone_number}
                  </a>
                )}
                {holder.email && (
                  <a href={`mailto:${holder.email}`} className="block text-moss hover:text-ember">
                    {holder.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
