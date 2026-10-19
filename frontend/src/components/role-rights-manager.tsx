"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { ROLE_OPTIONS } from "./roles-combobox";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type RoleRight = { code: string; label: string; description: string };
type RoleRightsPayload = { rights: RoleRight[]; by_role: Record<string, string[]> };

/** Church-wide permissions live apart from the member roster: this page says
 * what an office may do; User Management says who holds that office. */
export function RoleRightsManager() {
  const [data, setData] = useState<RoleRightsPayload>({ rights: [], by_role: {} });
  const [role, setRole] = useState("clerk");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/church-settings/`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => (res.ok ? res.json() : null))
      .then((settings) => {
        if (settings?.role_rights?.rights) setData(settings.role_rights);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (right: string) => {
    setData((previous) => {
      const current = previous.by_role[role] ?? [];
      const next = current.includes(right) ? current.filter((item) => item !== right) : [...current, right];
      return { ...previous, by_role: { ...previous.by_role, [role]: next } };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/members/church-settings/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ role_rights: data.by_role }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Could not save role permissions.");
      showAlert("Roles saved", "Role permissions have been updated.", "success");
    } catch (error) {
      showAlert("Could not save roles", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const selected = ROLE_OPTIONS.find((item) => item.value === role) ?? ROLE_OPTIONS[0];
  const held = new Set(data.by_role[selected.value] ?? []);
  if (loading) return <div className="py-8 text-center text-sm text-moss">Loading roles…</div>;

  return (
    <section className="min-h-dvh bg-white p-6 sm:p-8 lg:p-10">
      <div className="max-w-5xl">
        <h2 className="flex items-center gap-2 text-2xl font-semibold text-bark"><Shield size={20} /> Roles</h2>
        <p className="mt-1 text-sm text-moss">Choose what each church-wide role may do. Assign people to these roles from User Management.</p>
        <div className="mt-6 rounded-2xl border border-ember/30 bg-sand-linen p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ROLE_OPTIONS.map((item) => (
              <button key={item.value} type="button" onClick={() => setRole(item.value)} className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${role === item.value ? "border-ember bg-white text-bark shadow-sm" : "border-sand-line bg-sand/60 text-moss hover:border-ember/50"}`}>{item.label}</button>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-sand-line bg-white p-4">
            <p className="text-sm font-bold text-bark">{selected.label}<span className="ml-2 text-xs font-medium text-moss">(permissions)</span></p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.rights.map((right) => (
                <label key={right.code} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-xs transition ${held.has(right.code) ? "border-ember bg-sand-linen text-bark shadow-sm" : "border-sand-line bg-sand/60 text-moss hover:border-ember/50"}`}>
                  <input type="checkbox" checked={held.has(right.code)} onChange={() => toggle(right.code)} className="mt-0.5 h-4 w-4 rounded border-sand-mute text-ember focus:ring-ember" />
                  <span><span className="block font-bold">{right.label}</span><span className="mt-0.5 block leading-5">{right.description}</span></span>
                </label>
              ))}
            </div>
          </div>
          <button type="button" onClick={save} disabled={saving} className="mt-5 rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember-dark disabled:opacity-60">{saving ? "Saving…" : "Save role permissions"}</button>
        </div>
      </div>
    </section>
  );
}
