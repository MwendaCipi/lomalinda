"use client";

import { FileText, Plus, Printer, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Correspondence = {
  id: number;
  title: string;
  sender_or_recipient: string;
  category: "clerk_letter" | "recommendation" | "board_notice" | "general";
  body: string;
  date: string;
};

const categoryLabel: Record<Correspondence["category"], string> = {
  clerk_letter: "Clerk letter",
  recommendation: "Letter of recommendation",
  board_notice: "Board notice",
  general: "General correspondence",
};

const emptyDraft = () => ({
  title: "",
  body: "",
  date: new Date().toISOString().slice(0, 10),
});

export function CorrespondenceManager() {
  const [items, setItems] = useState<Correspondence[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const token = localStorage.getItem("access_token");
    try {
      const response = await fetch(`${API_URL}/api/members/correspondence/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setItems(Array.isArray(data) ? data : data.results ?? []);
    } catch {
      setMessage("Could not load correspondence. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void Promise.resolve().then(load); }, []);

  const openAdd = () => {
    setDraft(emptyDraft());
    setAdding(true);
    setMessage(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const token = localStorage.getItem("access_token");
    try {
      const response = await fetch(`${API_URL}/api/members/correspondence/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, sender_or_recipient: "Church correspondence", category: "general" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save the correspondence.");
      setItems((current) => [data, ...current]);
      setAdding(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the correspondence.");
    } finally {
      setSaving(false);
    }
  };

  const share = async () => {
    if (items.length === 0) return;
    const text = items.slice(0, 10).map((item) => `${item.date} — ${item.title} (${item.sender_or_recipient})`).join("\n");
    try {
      const supportsShare = "share" in navigator;
      if (supportsShare) await navigator.share({ title: "Church Correspondence", text });
      else await navigator.clipboard.writeText(text);
      setMessage(supportsShare ? "Correspondence shared." : "Correspondence copied to the clipboard.");
    } catch {
      // A cancelled share is deliberately quiet.
    }
  };

  const print = () => {
    if (items.length === 0) return;
    const rows = items.map((item) => `<article><h2>${escapeHtml(item.title)}</h2><p><strong>${escapeHtml(categoryLabel[item.category])}</strong> · ${escapeHtml(item.date)} · ${escapeHtml(item.sender_or_recipient)}</p><p>${escapeHtml(item.body).replace(/\n/g, "<br>")}</p></article>`).join("");
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(`<!doctype html><title>Church Correspondence</title><style>body{font:14px system-ui;margin:32px;color:#28201c}article{border-bottom:1px solid #ddd;padding:0 0 18px;margin:0 0 18px}h1{font-size:24px}h2{font-size:17px;margin:0 0 6px}p{line-height:1.5}</style><h1>Church Correspondence</h1>${rows}`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-white">
      {message && <div className="mx-5 mt-4 rounded-xl bg-sand px-4 py-3 text-xs font-medium text-bark">{message}</div>}
      <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {loading ? (
          <p className="text-sm text-moss">Loading correspondence…</p>
        ) : items.length === 0 ? (
          <div className="flex min-h-[20rem] flex-col items-center justify-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sand text-ember"><FileText size={25} aria-hidden="true" /></span>
            <h2 className="mt-4 text-lg font-bold text-bark">No correspondence yet</h2>
            <p className="mt-1 max-w-sm text-sm text-moss">Keep the church&apos;s letters, notices and recommendations together here.</p>
            <button type="button" onClick={openAdd} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-bark px-4 py-2.5 text-xs font-semibold text-white hover:bg-ember"><Plus size={15} aria-hidden="true" /> Add Correspondence</button>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {items.map((item) => <article key={item.id} className="rounded-2xl border border-sand-line p-4"><div><h2 className="font-bold text-bark">{item.title}</h2><p className="mt-0.5 text-xs text-moss">{item.date}</p></div><p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-bark">{item.body}</p></article>)}
          </div>
        )}
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-sand-line bg-white p-4 sm:flex sm:justify-end sm:px-6">
        <button type="button" onClick={openAdd} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-bark px-3 py-2 text-xs font-semibold text-white hover:bg-ember"><Plus size={14} aria-hidden="true" /> Add</button>
        <button type="button" onClick={() => void share()} disabled={items.length === 0} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sand-mute px-3 py-2 text-xs font-semibold text-bark hover:border-ember disabled:cursor-not-allowed disabled:opacity-45"><Share2 size={14} aria-hidden="true" /> Share</button>
        <button type="button" onClick={print} disabled={items.length === 0} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sand-mute px-3 py-2 text-xs font-semibold text-bark hover:border-ember disabled:cursor-not-allowed disabled:opacity-45"><Printer size={14} aria-hidden="true" /> Print</button>
      </div>
      {adding && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"><form onSubmit={save} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between border-b border-sand-line pb-3"><h2 className="text-lg font-bold text-bark">Add Correspondence</h2><button type="button" onClick={() => setAdding(false)} className="rounded-full p-2 text-moss hover:bg-sand"><X size={18} aria-hidden="true" /></button></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Title" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} required /><label className="text-xs font-semibold text-bark">Date<input type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} className="mt-1 block w-full rounded-xl border border-sand-line px-3 py-2 text-sm font-normal" /></label></div><label className="mt-4 block text-xs font-semibold text-bark">Correspondence<textarea required value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} rows={8} className="mt-1 block w-full rounded-xl border border-sand-line px-3 py-2 text-sm font-normal" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setAdding(false)} className="rounded-xl border border-sand-mute px-4 py-2 text-xs font-semibold text-moss">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-bark px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save Correspondence"}</button></div></form></div>}
    </section>
  );
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="text-xs font-semibold text-bark">{label}<input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-xl border border-sand-line px-3 py-2 text-sm font-normal" /></label>;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] || character));
}
