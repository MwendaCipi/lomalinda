"use client";

import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function AnnouncementManager() {
  const [form, setForm] = useState({ title: "", text: "", detail: "", href: "", visibility: "public" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/announcements/`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token")}` }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Unable to post announcement.");
      setForm({ title: "", text: "", detail: "", href: "", visibility: "public" }); setMessage("Announcement posted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to post announcement."); } finally { setLoading(false); }
  }

  return <section className="rounded-2xl border border-[#dfdbd1] bg-white p-7"><h2 className="text-2xl font-semibold">Post an announcement</h2><p className="mt-2 text-sm leading-6 text-[#617068]">Choose Public for everyone or Members only for signed-in members.</p><form onSubmit={submit} className="mt-6 grid gap-5 md:grid-cols-2"><label className="block text-sm font-medium">Title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3" /></label><label className="block text-sm font-medium">Visibility<select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value })} className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3"><option value="public">Public</option><option value="members">Members only</option></select></label><label className="block text-sm font-medium md:col-span-2">Announcement<textarea required value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3" /></label><label className="block text-sm font-medium">Details (optional)<textarea value={form.detail} onChange={(event) => setForm({ ...form, detail: event.target.value })} rows={2} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3" /></label><label className="block text-sm font-medium">Link (optional)<input value={form.href} onChange={(event) => setForm({ ...form, href: event.target.value })} placeholder="/calendar" className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3" /></label><div className="md:col-span-2"><button disabled={loading} className="rounded-full bg-[#b36b3c] px-6 py-3 font-semibold text-white disabled:opacity-60">{loading ? "Posting..." : "Post announcement"}</button>{message && <p className="mt-3 text-sm text-[#617068]">{message}</p>}</div></form></section>;
}
