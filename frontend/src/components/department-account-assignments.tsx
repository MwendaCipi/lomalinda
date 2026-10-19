"use client";

import { useEffect, useState } from "react";
import { Landmark, RefreshCw } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type Account = { id: number; name: string; description?: string; account_number?: string };
type Department = { code: string; label: string };

/** The configuration stored on ChurchSettings that maps ministry desks to the
 * treasury accounts they may read and use for withdrawal requests. */
export function DepartmentAccountAssignments() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [config, setConfig] = useState<Record<string, number[]>>({});
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const headers = (): Record<string, string> => {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/members/treasury/accounts/`, { headers: headers() }).then((res) => (res.ok ? res.json() : [])),
      fetch(`${API_URL}/api/members/departments/?all=true`, { headers: headers() }).then((res) => (res.ok ? res.json() : {})),
      fetch(`${API_URL}/api/members/treasury/department-assignments/`, { headers: headers() }).then((res) => (res.ok ? res.json() : {})),
    ])
      .then(([accountRows, departmentData, assignmentData]: [unknown, { departments?: Department[] }, { assignments?: { department_code: string; account_ids?: number[] }[] }]) => {
        const departmentRows = Array.isArray(departmentData?.departments) ? departmentData.departments.map((row: Department) => ({ code: row.code, label: row.label })) : [];
        setAccounts(Array.isArray(accountRows) ? accountRows : []);
        setDepartments(departmentRows);
        setSelected(departmentRows[0]?.code ?? "");
        const next: Record<string, number[]> = {};
        if (Array.isArray(assignmentData?.assignments)) {
          for (const row of assignmentData.assignments) next[row.department_code] = row.account_ids || [];
        }
        setConfig(next);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (accountId: number) => setConfig((previous) => {
    const current = previous[selected] ?? [];
    return { ...previous, [selected]: current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId] };
  });

  const save = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/members/treasury/department-assignments/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Could not save account assignments.");
      showAlert("Assignments saved", "Treasury accounts have been assigned to ministries and departments.", "success");
    } catch (error) {
      showAlert("Could not save assignments", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const active = departments.find((department) => department.code === selected);
  const assigned = config[selected] ?? [];
  return (
    <div className="rounded-2xl border border-bark/30 bg-sand p-5">
      <h3 className="flex items-center gap-2 text-base font-bold text-bark"><Landmark size={16} /> Ministry &amp; Department Accounts</h3>
      <p className="mt-1 text-xs text-moss">Choose the treasury accounts each ministry or department can view and use for withdrawal requests.</p>
      {loading ? <div className="flex items-center gap-2 py-8 text-xs font-semibold text-moss"><RefreshCw className="h-4 w-4 animate-spin" /> Loading account assignments…</div> : (
        <div className="mt-4 grid gap-4 md:grid-cols-[13rem_1fr]">
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-sand-line bg-white p-2">
            {departments.map((department) => <button key={department.code} type="button" onClick={() => setSelected(department.code)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold ${selected === department.code ? "bg-ember text-white" : "text-bark hover:bg-sand"}`}><span className="truncate">{department.label}</span>{(config[department.code] ?? []).length > 0 && <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{(config[department.code] ?? []).length}</span>}</button>)}
          </div>
          <div>
            <p className="text-sm font-bold text-bark">{active?.label ?? "Select a ministry or department"}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {accounts.map((account) => <label key={account.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs ${assigned.includes(account.id) ? "border-ember bg-sand-linen" : "border-sand-line bg-white"}`}><input type="checkbox" checked={assigned.includes(account.id)} onChange={() => toggle(account.id)} className="mt-0.5 h-4 w-4 rounded text-ember" /><span><span className="block font-bold text-bark">{account.description || account.name}</span>{account.account_number && <span className="text-moss">{account.account_number}</span>}</span></label>)}
            </div>
          </div>
        </div>
      )}
      <button type="button" onClick={save} disabled={saving || loading || !selected} className="mt-5 rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save account assignments"}</button>
    </div>
  );
}
