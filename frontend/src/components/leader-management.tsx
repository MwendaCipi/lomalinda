"use client";

import { useEffect, useState } from "react";
import { RolesCombobox, formatRoles, roleLabel, heldSystemRoles, ROLE_OPTIONS, refreshRoleRegister } from "./roles-combobox";
import { RecordList } from "./record-list";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type MemberUser = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  roles?: string[];
  assistant_roles?: string[];
  account_type?: string;
  is_disfellowshipped?: boolean;
  phone_number?: string;
};

const OFFICIAL_ROLES = ROLE_OPTIONS;

export function LeaderManagement() {
  const [members, setMembers] = useState<MemberUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberUser | null>(null);
  const [modalSelectedRoles, setModalSelectedRoles] = useState<string[]>(["elder"]);
  const [modalSelectedAssistants, setModalSelectedAssistants] = useState<string[]>([]);
  const [modalSearch, setModalSearch] = useState("");
  const [submittingModal, setSubmittingModal] = useState(false);

  const fetchMembers = () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    setLoading(true);
    fetch(`${API_URL}/api/members/users/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setMembers(data))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleRolesChange = async (userId: number, newRoles: string[], newAssistants: string[] = []) => {
    setUpdatingId(userId);
    setMessage(null);
    const previous = members.find((m) => m.id === userId);
    const previousRoles = previous?.roles || ["member"];
    const previousAssistants = previous?.assistant_roles || [];
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/users/${userId}/role/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roles: newRoles, assistant_roles: newAssistants }),
      });
      const data = await res.json();
      if (res.ok) {
        refreshRoleRegister();
        setMessage({ type: "success", text: data.detail || "Roles updated successfully. Notification and email sent to member." });
        setMembers((prev) =>
          prev.map((m) =>
            m.id === userId
              ? { ...m, roles: newRoles, assistant_roles: newAssistants, role: newRoles[0] || "member" }
              : m
          )
        );
      } else {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === userId
              ? { ...m, roles: previousRoles, assistant_roles: previousAssistants, role: previousRoles[0] || "member" }
              : m
          )
        );
        setMessage({ type: "error", text: data.detail || data.roles || "Failed to update roles." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error updating roles." });
    } finally {
      setUpdatingId(null);
    }
  };

  // Only show people holding at least one leadership role (not general members, not friends, not ex-members)
  const leaders = members.filter(
    (m) => !m.is_disfellowshipped && m.account_type !== "friend" && (m.roles || [m.role || "member"]).some((r) => r !== "member")
  );

  const filteredMembers = leaders.filter(
    (m) =>
      m.username.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      (m.first_name + " " + m.last_name).toLowerCase().includes(search.toLowerCase()) ||
      (m.roles || [m.role || "member"]).some((r) => roleLabel(r).toLowerCase().includes(search.toLowerCase()))
  );

  const handlePrint = () => {
    const escapeHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = filteredMembers
      .map((m, idx) => {
        const name =
          m.first_name || m.last_name
            ? `${m.first_name} ${m.last_name}`.trim()
            : m.username;
        const contact = m.phone_number || m.email || "—";
        const roles = (m.roles || [m.role || "member"]).map(roleLabel).join(", ");
        return `<tr><td>${idx + 1}</td><td>${escapeHtml(name)}</td><td>${escapeHtml(contact)}</td><td style="text-transform:capitalize">${escapeHtml(roles)}</td></tr>`;
      })
      .join("");
    const printWindow = window.open("", "_blank", "width=900,height=650");
    if (!printWindow) return;
    printWindow.document.write(
      `<!DOCTYPE html>
<html>
  <head>
    <title>Church Leaders</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #26352f; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      p.meta { font-size: 11px; color: #617068; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #dfdbd1; padding: 8px 10px; text-align: left; }
      th { background: #f7f4ee; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; color: #b36b3c; }
    </style>
  </head>
  <body>
    <h1>Church Leaders</h1>
    <p class="meta">${filteredMembers.length} leaders &bull; Printed ${new Date().toLocaleDateString()}</p>
    <table>
      <thead><tr><th>#</th><th>Member</th><th>Contact</th><th>Role(s)</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4">No members found.</td></tr>`}</tbody>
    </table>
  </body>
</html>`
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // Modal search: only active church members (no friends, no ex-members); empty until the clerk searches
  const modalPool = members.filter((m) => !m.is_disfellowshipped && m.account_type !== "friend");
  const modalFilteredMembers = modalSearch.trim()
    ? modalPool.filter(
        (m) =>
          m.username.toLowerCase().includes(modalSearch.toLowerCase()) ||
          m.email.toLowerCase().includes(modalSearch.toLowerCase()) ||
          (m.first_name + " " + m.last_name).toLowerCase().includes(modalSearch.toLowerCase()) ||
          (m.phone_number && m.phone_number.includes(modalSearch))
      )
    : [];

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || modalSelectedRoles.length === 0) return;
    setSubmittingModal(true);
    // Merge with the member's existing roles instead of replacing them
    const existing = (selectedMember.roles || [selectedMember.role || "member"]).filter((r) => r !== "member");
    const merged = Array.from(new Set([...existing, ...modalSelectedRoles]));
    // Assistants follow the roles: a ticked assistant that is not in the merged
    // set would be refused by the church rule anyway.
    const mergedAssistants = Array.from(
      new Set([...(selectedMember.assistant_roles || []), ...modalSelectedAssistants])
    ).filter((code) => merged.includes(code));
    await handleRolesChange(selectedMember.id, merged.length > 0 ? merged : ["member"], mergedAssistants);
    setSubmittingModal(false);
    setIsModalOpen(false);
  };

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-6 overflow-hidden border-b border-[#dfdbd1] bg-white p-6 sm:p-8 lg:p-10 pb-3 sm:pb-3 lg:pb-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#26352f]">Church Leaders</h2>
          <p className="mt-1 text-xs text-[#617068]">
            Set, change, or unset leadership roles for church members to grant administrative rights.
          </p>
        </div>
        <input
          type="text"
          placeholder="Filter by name, username, email or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-72 lg:w-96 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
        />
      </div>

      {message && (
        <div
          className={`rounded-2xl p-4 text-xs font-semibold ${
            message.type === "success"
              ? "bg-[#eef2ed] text-[#3d5148]"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Table on desktop, cards on phones — RecordList owns the breakpoint pair. */}
      <RecordList
        rows={filteredMembers}
        loading={loading}
        rowKey={(m) => m.id}
        headers={[
          { label: "#", className: "w-10" },
          { label: "Member" },
          { label: "Contact" },
          { label: "Roles" },
        ]}
        loadingLabel="Loading member leadership records..."
        tableEmpty="No members found matching your search."
        stateClassName="py-4 text-center text-[#617068]"
        tableWrapperClassName="flex-1 min-h-0 overflow-auto custom-table-scrollbar"
        cardsClassName="custom-table-scrollbar min-h-0 flex-1 grid gap-3 overflow-y-auto overscroll-contain pb-2"
        cardsStateClassName="py-8 text-center text-xs text-[#617068] bg-white rounded-xl p-4 border border-[#dfdbd1]"
        renderCard={(m, idx) => (
            <div key={m.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-[#eeeae2] pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-[#617068]">#{idx + 1}</span>
                  <h3 className="font-bold text-sm text-[#26352f]">
                    {m.first_name || m.last_name ? `${m.first_name} ${m.last_name}`.trim() : m.username}
                  </h3>
                </div>
                <span className="rounded-full bg-[#eef2ed] px-2.5 py-0.5 text-[10px] font-bold capitalize text-[#3d5148]">
                  {formatRoles(m.roles || [m.role || "member"])}
                </span>
              </div>

              <div className="text-xs text-[#617068]">
                Contact: <strong className="text-[#26352f]">{m.phone_number || m.email || "—"}</strong>
              </div>

              <div className="pt-2 border-t border-[#eeeae2] flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-[#617068]">Role(s):</label>
                <RolesCombobox
                  selected={m.roles && m.roles.length > 0 ? m.roles : [m.role || "member"]}
                  onChange={(newRoles, newAssistants) => handleRolesChange(m.id, newRoles, newAssistants)}
                  disabled={updatingId === m.id}
                  lockedRoles={heldSystemRoles(m.roles, m.role)}
                  memberId={m.id}
                  assistants={m.assistant_roles || []}
                  showAssistants
                  align="right"
                />
              </div>
            </div>
          )}
        renderRow={(m, idx) => (
                <tr key={m.id} className="hover:bg-[#f7f4ee]">
                  <td className="py-3.5 font-medium text-[#617068] w-10">
                    {idx + 1}
                  </td>
                  <td className="py-3.5 font-semibold text-[#26352f]">
                    {m.first_name || m.last_name
                      ? `${m.first_name} ${m.last_name}`.trim()
                      : m.username}
                  </td>
                  <td className="py-3.5 text-[#617068]">
                    {m.phone_number || m.email || "—"}
                  </td>
                  <td className="py-3.5">
                    <RolesCombobox
                      selected={m.roles && m.roles.length > 0 ? m.roles : [m.role || "member"]}
                      onChange={(newRoles, newAssistants) => handleRolesChange(m.id, newRoles, newAssistants)}
                      disabled={updatingId === m.id}
                      lockedRoles={heldSystemRoles(m.roles, m.role)}
                      memberId={m.id}
                      assistants={m.assistant_roles || []}
                      showAssistants
                      align="right"
                    />
                  </td>
                </tr>
            )}
      />

      {/* Actions: Print & Add Leader — pulled tight against the list above
          (-mt-2) so the buttons sit close to the records without a dead band */}
      <div className="-mt-2 flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-2">
        <button
          onClick={handlePrint}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#dfdbd1] bg-white px-4 py-2.5 text-xs font-semibold text-[#26352f] shadow-sm hover:bg-[#f7f4ee] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print Leaders
        </button>
        <button
          onClick={() => {
            setSelectedMember(null);
            setModalSearch("");
            setModalSelectedRoles(["elder"]);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#b36b3c] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#96552c] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Add Leader
        </button>
      </div>

      {/* Add Leader Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-[#dfdbd1] space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <div>
                <h3 className="text-lg font-bold text-[#26352f]">Add Church Leader</h3>
                <p className="text-xs text-[#617068]">
                  Search a church member and assign them a leadership role.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="space-y-4">
              {/* Step 1: Member Search & Select */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#26352f]">
                  1. Search & Select Member
                </label>
                <input
                  type="text"
                  placeholder="Type to search active church members..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3.5 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
                />

                <div className="max-h-48 overflow-y-auto rounded-xl border border-[#dfdbd1] divide-y divide-[#dfdbd1]">
                  {modalSearch.trim() === "" ? (
                    <div className="p-3 text-center text-xs text-[#617068]">
                      Start typing to search church members.
                    </div>
                  ) : modalFilteredMembers.length === 0 ? (
                    <div className="p-3 text-center text-xs text-[#617068]">
                      No members match your search criteria.
                    </div>
                  ) : (
                    modalFilteredMembers.map((m) => {
                      const isSelected = selectedMember?.id === m.id;
                      const nameStr = `${m.first_name} ${m.last_name}`.trim() || m.username;
                      return (
                        <div
                          key={m.id}
                          onClick={() => setSelectedMember(m)}
                          className={`p-3 text-xs cursor-pointer transition-colors flex items-center justify-between ${
                            isSelected
                              ? "bg-[#eef2ed] border-l-4 border-[#b36b3c]"
                              : "hover:bg-[#f7f4ee]"
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-[#26352f]">{nameStr}</div>
                            <div className="text-[10px] text-[#617068]">
                              @{m.username} {m.email ? `• ${m.email}` : ""} {m.phone_number ? `• ${m.phone_number}` : ""}
                            </div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                            {formatRoles(m.roles || [m.role || "member"])}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                {selectedMember && (
                  <p className="text-[11px] text-[#3d5148] font-medium">
                    Selected: <span className="font-bold">{selectedMember.first_name} {selectedMember.last_name} (@{selectedMember.username})</span>
                  </p>
                )}
              </div>

              {/* Step 2: Role Selection (multi-select) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#26352f]">
                  2. Select Leadership Role(s)
                </label>
                <p className="text-[10px] text-[#617068]">
                  Tick every role to assign. Roles are added to any the member already holds.
                </p>
                <RolesCombobox
                  selected={modalSelectedRoles}
                  onChange={(roles, assists) => {
                    setModalSelectedRoles(roles);
                    setModalSelectedAssistants(assists);
                  }}
                  memberId={selectedMember?.id}
                  assistants={modalSelectedAssistants}
                  showAssistants
                  align="left"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#dfdbd1]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-[#dfdbd1] px-4 py-2 text-xs font-semibold text-[#617068] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedMember || modalSelectedRoles.length === 0 || submittingModal}
                  className="rounded-xl bg-[#b36b3c] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#96552c] disabled:opacity-50 transition-colors"
                >
                  {submittingModal ? "Assigning Role..." : "Assign Role & Notify Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
