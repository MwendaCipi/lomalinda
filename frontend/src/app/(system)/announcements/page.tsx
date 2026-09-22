"use client";

import { useCallback, useEffect, useState } from "react";
import { FellowshipSidebar } from "@/components/sidebars/fellowship-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
function getQuarterStartDate() {
  const now = new Date();
  const year = now.getFullYear();
  const qMonth = Math.floor(now.getMonth() / 3) * 3;
  const mStr = String(qMonth + 1).padStart(2, "0");
  return `${year}-${mStr}-01`;
}

function getTodayDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
}

type Announcement = {
  id: number;
  title: string;
  text: string;
  attachment?: string | null;
  visibility: string;
  action_type?: "none" | "tithe" | "combined_offering" | "13th_sabbath" | "camp_expenses" | "camp_goal" | "local_church_budget" | "respond";
  is_popup?: boolean;
  expires_at?: string | null;
  created_at: string;
};

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(getQuarterStartDate);
  const [endDate, setEndDate] = useState(getTodayDate);
  const [loading, setLoading] = useState(true);

  const loadAnnouncements = useCallback((filters = { search, startDate, endDate }) => {
    setLoading(true);
    const params = new URLSearchParams({ include_expired: "true" });
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Announcement[]) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoading(false));
  }, [endDate, search, startDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadAnnouncements({ search, startDate, endDate });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search, startDate, endDate, loadAnnouncements]);

  return (
    <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <FellowshipSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] bg-white p-5 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6 container">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Announcements</h1>
              <p className="hidden sm:block mt-3 text-base text-[#617068]">Search the church announcement archive by keyword or date.</p>
            </div>

            <div className="grid grid-cols-2 gap-4 rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm lg:grid-cols-4">
              <label className="text-sm font-semibold text-[#26352f]">
                From
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#b36b3c]"
                />
              </label>

              <label className="text-sm font-semibold text-[#26352f]">
                To
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#b36b3c]"
                />
              </label>

              <label className="col-span-2 text-sm font-semibold text-[#26352f] lg:col-span-2">
                Search
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search announcements..."
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#b36b3c]"
                />
              </label>
            </div>

            {loading ? <p className="text-sm text-[#617068]">Loading announcements…</p> : announcements.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#c9c5bb] bg-white p-10 text-center text-[#617068]">No announcements found.</div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {announcements.map((announcement) => {
                  const cardClasses = "flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9";
                  const hasContributionAction = announcement.action_type && announcement.action_type !== "none" && announcement.action_type !== "respond";
                  const attachmentUrl = announcement.attachment?.startsWith("/")
                    ? `${API_URL}${announcement.attachment}`
                    : announcement.attachment;

                  const content = (
                    <>
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b36b3c]">Announcement</p>
                          <span className="rounded-full bg-[#f7f4ee] px-3 py-1 text-xs font-semibold text-[#617068]">{new Date(announcement.created_at).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" })}</span>
                          <span className="rounded-full bg-[#eef2ed] px-3 py-1 text-xs font-semibold text-[#3d5148] capitalize">{announcement.visibility}</span>
                          {hasContributionAction && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Contribution Action</span>}
                          {announcement.action_type === "respond" && <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">Response Action</span>}
                          {announcement.expires_at && <span className="rounded-full bg-[#f7f4ee] px-3 py-1 text-xs font-semibold text-[#617068]">Until {new Date(`${announcement.expires_at}T00:00:00`).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}</span>}
                        </div>
                        <h2 className="mt-3 text-2xl font-semibold">{announcement.title}</h2>
                        <p className="mt-4 text-base leading-7 text-[#26352f]">{announcement.text}</p>
                      </div>
                      {attachmentUrl && (
                        <div className="mt-6 border-t border-[#dfdbd1] pt-4">
                          <a href={attachmentUrl} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-[#b36b3c] hover:underline">Open attachment</a>
                        </div>
                      )}
                    </>
                  );

                  return <article key={announcement.id} className={cardClasses}>{content}</article>;
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
