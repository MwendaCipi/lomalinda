"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type Announcement = { id: number; title: string; text: string; detail: string; href: string; visibility: string; expires_at?: string | null; created_at: string };

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);

  function loadAnnouncements(filters = { search, startDate, endDate }) {
    setLoading(true);
    const params = new URLSearchParams({ include_expired: "true" });
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/?${params.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Announcement[]) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => loadAnnouncements({ search: "", startDate: "", endDate: "" }), 0);
    return () => window.clearTimeout(timer);
    // The initial request intentionally uses empty filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadAnnouncements();
  }

  function clearFilters() {
    setSearch("");
    setStartDate("");
    setEndDate("");
    loadAnnouncements({ search: "", startDate: "", endDate: "" });
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 py-12 text-[#26352f] sm:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Announcements</h1>
          <p className="mt-5 text-lg leading-8 text-[#617068]">Search the church announcement archive by keyword or date.</p>
        </div>

        <form onSubmit={submitFilters} className="mt-10 grid grid-cols-2 gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm lg:grid-cols-4">
          <label className="col-span-2 text-sm font-semibold text-[#26352f] lg:col-span-2">
            Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search announcements" className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#b36b3c]" />
          </label>
          <label className="text-sm font-semibold text-[#26352f]">
            From
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#b36b3c]" />
          </label>
          <label className="text-sm font-semibold text-[#26352f]">
            To
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#b36b3c]" />
          </label>
          <div className="col-span-2 flex gap-3 lg:col-span-4">
            <button type="submit" className="rounded-xl bg-[#b36b3c] px-5 py-3 text-sm font-semibold text-white hover:bg-[#96552e]">Search</button>
            <button type="button" onClick={clearFilters} className="rounded-xl border border-[#c9c5bb] px-5 py-3 text-sm font-semibold text-[#26352f] hover:border-[#b36b3c]">Clear</button>
          </div>
        </form>

        {loading ? <p className="mt-10 text-sm text-[#617068]">Loading announcements…</p> : announcements.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-[#c9c5bb] bg-white p-10 text-center text-[#617068]">No announcements found.</div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {announcements.map((announcement) => (
              <article key={announcement.id} className="flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b36b3c]">Announcement</p>
                    <span className="rounded-full bg-[#f7f4ee] px-3 py-1 text-xs font-semibold text-[#617068]">{new Date(announcement.created_at).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" })}</span>
                    {announcement.visibility === "members" && <span className="rounded-full bg-[#eef2ed] px-3 py-1 text-xs font-semibold text-[#3d5148]">Members only</span>}
                    {announcement.expires_at && <span className="rounded-full bg-[#f7f4ee] px-3 py-1 text-xs font-semibold text-[#617068]">Until {new Date(`${announcement.expires_at}T00:00:00`).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}</span>}
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold">{announcement.title}</h2>
                  <p className="mt-4 text-base leading-7 text-[#26352f]">{announcement.text}</p>
                  {announcement.detail && <p className="mt-3 text-sm leading-6 text-[#617068]">{announcement.detail}</p>}
                </div>
                {announcement.href && <div className="mt-6 border-t border-[#dfdbd1] pt-4"><Link href={announcement.href} className="inline-block text-sm font-semibold text-[#b36b3c] hover:underline">Learn more &rarr;</Link></div>}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
