"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { BackToOverviewArrow } from "@/components/back-to-overview-arrow";
import { RecordList } from "@/components/record-list";
import {
  DEPARTMENT_MANAGED_ROLE_CODES,
  NO_ROLE_LABEL,
  RolesCombobox,
  formatRoles,
  refreshRoleRegister,
} from "@/components/roles-combobox";
import type { MemberUser } from "@/components/user-management";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** The subset of the roster this desk reads — one member, as the list shows it. */
type RoleRow = Pick<
  MemberUser,
  "id" | "username" | "first_name" | "last_name" | "email" | "role" | "roles" | "assistant_roles" | "account_type"
> & { is_superuser?: boolean };

/** The member's roles, as the picker and the summary both read them. */
function rolesOf(member: RoleRow): string[] {
  return member.roles && member.roles.length > 0 ? member.roles : [member.role || "member"];
}

/**
 * Role Management — the church's register of who holds which office.
 *
 * User Management keeps the whole roster (accounts, standing, invites, the
 * record itself); this desk is the one place to hand a role to a member or
 * take one back, with nothing else on the page to distract from it. Elder
 * seats, the clerk's seat and the department leaders are appointed in
 * Departments & Ministries and stay hidden here, so no role can be assigned
 * from two desks.
 */
export function RoleManagement() {
  const [members, setMembers] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  // The member whose roles are being changed, by id — the save is one PATCH
  // per change, so the row stays in place and the picker closes on success.
  const [savingId, setSavingId] = useState<number | null>(null);

  // The roster, fetched once. Every setState lands in a promise callback so
  // the first paint is the loading cell rather than a cascading render.
  useEffect(() => {
    let cancelled = false;
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    fetch(`${API_URL}/api/members/users/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: RoleRow[]) => {
        if (cancelled) return;
        setMembers(
          (Array.isArray(rows) ? rows : []).filter(
            // The installation's owner account is not a member of this church.
            (row) => !row.is_superuser
          )
        );
      })
      // The list is the desk; a failed fetch shows the empty state with the
      // search box still usable for the next attempt.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Save one member's roles — the same PATCH the roster's modal makes. */
  const saveRoles = (member: RoleRow, roles: string[], assistants: string[]) => {
    const token = localStorage.getItem("access_token");
    setSavingId(member.id);
    fetch(`${API_URL}/api/members/users/${member.id}/role/`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ roles, assistant_roles: assistants }),
    })
      .then(async (res) => {
        if (res.ok) {
          showAlert("Roles updated", "", "success", { toast: true, timer: 3500, showConfirmButton: false });
          refreshRoleRegister();
          setMembers((prev) =>
            prev.map((row) => (row.id === member.id ? { ...row, roles, assistant_roles: assistants } : row))
          );
        } else {
          const data = await res.json().catch(() => ({}));
          showAlert("Could not update roles", data.detail || data.roles || "Try again.", "error");
        }
      })
      .catch(() => showAlert("Network error", "Could not reach the server.", "error"))
      .finally(() => setSavingId(null));
  };

  /** The roster, narrowed by name, email or username. */
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? members.filter((member) =>
          [member.first_name, member.last_name, member.username, member.email]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(needle))
        )
      : members;
    // The church's offices read first — a role hunt starts with the leaders.
    return [...rows].sort((a, b) => {
      const rank = (row: RoleRow) => (rolesOf(row).some((code) => code !== "member") ? 0 : 1);
      return rank(a) - rank(b) || String(a.first_name || a.username).localeCompare(String(b.first_name || b.username));
    });
  }, [members, query]);

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* ── Header ── */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-sand-line px-5 pb-3 pt-2 sm:px-6">
        <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="flex items-center gap-1">
            <BackToOverviewArrow />
            {/* Named by the strip above on a wide screen. */}
            <h2 className="text-xl font-bold text-bark md:hidden">Role Management</h2>
          </span>
        </div>
        <p className="text-xs text-moss">
          Hand a church-wide office to a member, or take one back. Elder seats, the clerk and the department
          leaders are appointed in Departments &amp; Ministries.
        </p>
        {/* ── Search ── */}
        <div className="relative w-full sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-moss" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search members by name, email or username"
            className="w-full rounded-xl border border-sand-line bg-sand-plate py-2 pl-9 pr-3 text-xs text-bark placeholder:text-moss focus:border-ember focus:outline-none"
          />
        </div>
      </div>

      {/* ── Scrollable list ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 custom-table-scrollbar sm:px-6">
        <RecordList<RoleRow>
          rows={filtered}
          loading={loading}
          rowKey={(row) => row.id}
          headers={[
            { label: "Name", className: "w-[16rem]" },
            { label: "Email", className: "w-[14rem]" },
            { label: "Roles held" },
          ]}
          loadingLabel="Loading the role register..."
          tableEmpty="No members match that search."
          cardsEmpty="No members match that search."
          renderRow={(member) => {
            const selected = rolesOf(member);
            const assistants = member.assistant_roles || [];
            return (
              <tr key={member.id} className="hover:bg-sand align-middle">
                <td className="py-3 pr-3">
                  <span className="block truncate text-xs font-semibold text-bark">
                    {member.first_name || member.last_name
                      ? `${member.first_name} ${member.last_name}`.trim()
                      : member.username}
                  </span>
                  <span className="block truncate text-[11px] text-moss">@{member.username}</span>
                </td>
                <td className="py-3 pr-3">
                  <span className="block truncate text-xs text-moss">{member.email || "—"}</span>
                </td>
                <td className="py-3">
                  <span
                    className="block truncate text-xs text-bark"
                    title={formatRoles(selected, assistants)}
                  >
                    {formatRoles(selected, assistants) || NO_ROLE_LABEL}
                  </span>
                  <span className="mt-1 flex justify-start">
                    <RolesCombobox
                      selected={selected}
                      assistants={assistants}
                      showAssistants
                      memberId={member.id}
                      hiddenRoles={DEPARTMENT_MANAGED_ROLE_CODES}
                      disabled={savingId === member.id}
                      onChange={(roles, nextAssistants) => saveRoles(member, roles, nextAssistants)}
                    />
                  </span>
                </td>
              </tr>
            );
          }}
          renderCard={(member) => {
            const selected = rolesOf(member);
            const assistants = member.assistant_roles || [];
            return (
              <div key={member.id} className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-bold text-bark">
                      {member.first_name || member.last_name
                        ? `${member.first_name} ${member.last_name}`.trim()
                        : member.username}
                    </span>
                    <span className="block truncate text-xs text-moss">{member.email || `@${member.username}`}</span>
                  </div>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-sand-line bg-sand-plate px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-bark">
                    {formatRoles(selected, assistants) || NO_ROLE_LABEL}
                  </span>
                  <RolesCombobox
                    selected={selected}
                    assistants={assistants}
                    showAssistants
                    memberId={member.id}
                    hiddenRoles={DEPARTMENT_MANAGED_ROLE_CODES}
                    disabled={savingId === member.id}
                    onChange={(roles, nextAssistants) => saveRoles(member, roles, nextAssistants)}
                  />
                </div>
              </div>
            );
          }}
        />
      </div>
    </section>
  );
}
