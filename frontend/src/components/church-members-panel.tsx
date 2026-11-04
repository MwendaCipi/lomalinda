"use client";

/**
 * The church's roll, read inside the pastorate's desk.
 *
 * User Management is the office's desk for accounts — adding a member,
 * inviting one, switching a login off. This is the shepherd's copy of the same
 * roll: who the church is, how to reach them, the office each holds and
 * whether their account can sign in. It reads the roster the office keeps
 * (`/api/members/users/`), so the two can never disagree, and it writes
 * nothing — a correction belongs to the desk that owns the record.
 */

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { accountTypeLabel, roleDisplayLabel } from "./roles-combobox";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type RosterRow = {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  role?: string;
  roles?: string[];
  account_type?: string;
  is_active?: boolean;
  deactivated_at?: string | null;
};

type TypeFilter = "all" | "member" | "sabbath_school" | "friend";

const TYPE_FILTERS: { key: TypeFilter; label: string; help: string }[] = [
  { key: "all", label: "All", help: "Everyone on the church's roll" },
  { key: "member", label: "Members", help: "The church's baptised members" },
  { key: "sabbath_school", label: "S. School", help: "Attends Sabbath School, not yet a baptised member" },
  { key: "friend", label: "Friends", help: "Friends of the church who are not members" },
];

function fullName(row: RosterRow): string {
  const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return name || row.username;
}

/** The office a person holds, as the roll names it — every one, where several. */
function officeOf(row: RosterRow): string {
  const roles = (row.roles ?? []).filter(Boolean);
  if (roles.length > 0) return roles.map((role) => roleDisplayLabel(role)).join(", ");
  return row.role ? roleDisplayLabel(row.role) : "—";
}

/**
 * Whether the account can sign in, in the three states the roll actually
 * holds: running, switched off by an officer, or still waiting to be approved.
 * "Inactive" on its own would not say which of the last two it is.
 */
function standing(row: RosterRow): { label: string; tone: string; title: string } {
  if (row.is_active !== false) {
    return {
      label: "Active",
      tone: "bg-mist-select text-moss-dark",
      title: "This account can sign in",
    };
  }
  if (row.deactivated_at) {
    return {
      label: "Switched off",
      tone: "bg-sand text-moss",
      title: "An officer switched this account off",
    };
  }
  return {
    label: "Not approved",
    tone: "bg-ember/10 text-ember",
    title: "Still waiting on the office's approval",
  };
}

export function ChurchMembersPanel() {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeFilter>("all");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/users/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const tally: Record<TypeFilter, number> = {
      all: rows.length,
      member: 0,
      sabbath_school: 0,
      friend: 0,
    };
    rows.forEach((row) => {
      const key = (row.account_type ?? "member") as TypeFilter;
      if (key !== "all" && key in tally) tally[key] += 1;
    });
    return tally;
  }, [rows]);

  const needle = search.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (type !== "all" && (row.account_type ?? "member") !== type) return false;
    if (!needle) return true;
    return `${fullName(row)} ${row.username} ${row.phone_number ?? ""} ${row.email ?? ""} ${officeOf(row)}`
      .toLowerCase()
      .includes(needle);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-sand-line px-3 py-2.5">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moss"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the roll"
            aria-label="Search the church's roll"
            className="h-9 w-full rounded-xl border border-sand-line bg-white pl-8 pr-3 text-xs text-bark outline-none transition focus:border-ember"
          />
        </div>
        <div role="group" aria-label="Account type" className="flex flex-wrap items-center gap-1">
          {TYPE_FILTERS.map((filter) => {
            const active = filter.key === type;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setType(filter.key)}
                aria-pressed={active}
                title={filter.help}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  active ? "bg-bark text-white" : "bg-sand text-moss hover:text-bark"
                }`}
              >
                {filter.label}
                <span className={active ? "ml-1 text-white/70" : "ml-1 text-moss-faint"}>{counts[filter.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-table-scrollbar">
        {loading ? (
          <p className="py-10 text-center text-xs text-moss">Loading the church&rsquo;s roll…</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-xs text-moss">
            {rows.length === 0 ? "The roll is empty." : "Nobody on the roll matches that."}
          </p>
        ) : (
          <table className="w-full text-center text-xs sm:text-left">
            <thead className="sticky top-0 z-10 bg-white text-[11px] font-bold uppercase tracking-wider text-ember">
              <tr className="border-b border-sand-line">
                <th className="px-4 pb-2.5 pt-2.5 text-center font-bold sm:text-left">Name</th>
                <th className="hidden px-4 pb-2.5 pt-2.5 text-center font-bold sm:table-cell sm:text-left">Contact</th>
                <th className="hidden px-4 pb-2.5 pt-2.5 text-center font-bold sm:table-cell sm:text-left">Office</th>
                <th className="hidden px-4 pb-2.5 pt-2.5 text-center font-bold sm:table-cell sm:text-left">Type</th>
                <th className="px-4 pb-2.5 pt-2.5 text-center font-bold sm:text-right">Standing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-soft">
              {visible.map((row) => {
                const state = standing(row);
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-bark">{fullName(row)}</p>
                      {/* A phone reads the row whole: the contact the desk
                          columns would keep out of sight rides under the
                          name instead. */}
                      <p className="text-[11px] text-moss sm:hidden">
                        {row.phone_number || row.email || row.username}
                      </p>
                    </td>
                    <td className="hidden px-4 py-2.5 text-moss sm:table-cell">
                      <p>{row.phone_number || "—"}</p>
                      {row.email ? <p className="text-[11px] text-moss-faint">{row.email}</p> : null}
                    </td>
                    <td className="hidden px-4 py-2.5 text-moss sm:table-cell">{officeOf(row)}</td>
                    <td className="hidden px-4 py-2.5 text-moss sm:table-cell">
                      {accountTypeLabel(row.account_type ?? "member")}
                    </td>
                    <td className="px-4 py-2.5 text-center sm:text-right">
                      <span
                        title={state.title}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${state.tone}`}
                      >
                        {state.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="shrink-0 border-t border-sand-line px-4 py-2 text-[11px] text-moss">
        {loading ? "Reading the roll…" : `${visible.length} of ${rows.length} on the roll`} · the office adds and
        edits accounts.
      </p>
    </div>
  );
}
