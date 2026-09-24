"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FellowshipSidebar } from "@/components/sidebars/fellowship-sidebar";
import { AnnouncementAttachment } from "@/components/announcement-attachment";
import { eventLabel } from "@/lib/announcement-dates";

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

type FundDrive = {
  id: number;
  name: string;
  title?: string;
  description?: string;
  target_amount: number | string;
  total_raised: number;
  percentage_raised: number;
  end_date?: string | null;
  donor_count?: number;
  attachment?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
};

type FeedItem = {
  id: number;
  kind?: "announcement" | "fund_drive";
  title: string;
  text: string;
  href?: string | null;
  event_date_from?: string | null;
  event_date_to?: string | null;
  attachment?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  visibility: string;
  action_type?: "none" | "tithe" | "combined_offering" | "13th_sabbath" | "camp_expenses" | "camp_goal" | "local_church_budget" | "respond";
  is_popup?: boolean;
  expires_at?: string | null;
  created_at: string;
  fund_drive?: FundDrive | null;
};

/** The drive's own giving link, opened straight into the giving modal. */
function driveGiveHref(drive: FundDrive) {
  return `/give?purpose=${encodeURIComponent(drive.title || drive.name)}`;
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(getQuarterStartDate);
  const [endDate, setEndDate] = useState(getTodayDate);
  const [loading, setLoading] = useState(true);

  const loadFeed = useCallback((filters = { search, startDate, endDate }) => {
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
      .then((data: FeedItem[]) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoading(false));
  }, [endDate, search, startDate]);

  // Drives are announced through the same feed; keep the state name the rest
  // of the page already reads.
  const setAnnouncements = (rows: FeedItem[]) => setItems(rows);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadFeed({ search, startDate, endDate });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search, startDate, endDate, loadFeed]);

  return (
    <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <FellowshipSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] bg-white p-5 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6 container">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Announcements</h1>
              <p className="hidden sm:block mt-2 text-base text-[#617068]">
                Church announcements and fund drives in one feed — search by keyword or date.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#dfdbd1] bg-white px-4 py-3 shadow-sm lg:grid-cols-4">
              <label className="text-sm font-semibold text-[#26352f]">
                From
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2 text-sm font-normal outline-none focus:border-[#b36b3c]"
                />
              </label>

              <label className="text-sm font-semibold text-[#26352f]">
                To
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2 text-sm font-normal outline-none focus:border-[#b36b3c]"
                />
              </label>

              <label className="col-span-2 text-sm font-semibold text-[#26352f] lg:col-span-2">
                Search
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search announcements..."
                  className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2 text-sm font-normal outline-none focus:border-[#b36b3c]"
                />
              </label>
            </div>

            {loading ? <p className="text-sm text-[#617068]">Loading announcements…</p> : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#c9c5bb] bg-white p-10 text-center text-[#617068]">No announcements found.</div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {items.map((item) => {
                  const isDrive = item.kind === "fund_drive" && item.fund_drive;
                  const drive = item.fund_drive;
                  const cardClasses = "flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-9";
                  const hasContributionAction = item.action_type && item.action_type !== "none" && item.action_type !== "respond";
                  const content = (
                    <>
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          {isDrive ? (
                            <span className="rounded-full bg-[#b36b3c] px-3 py-1 text-xs font-semibold text-white">Fund drive</span>
                          ) : (
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b36b3c]">Announcement</p>
                          )}
                          <span className="rounded-full bg-[#f7f4ee] px-3 py-1 text-xs font-semibold text-[#617068]">{new Date(item.created_at).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" })}</span>
                          <span className="rounded-full bg-[#eef2ed] px-3 py-1 text-xs font-semibold text-[#3d5148] capitalize">{item.visibility}</span>
                          {eventLabel(item) && (
                            <span className="rounded-full bg-[#b36b3c]/10 px-3 py-1 text-xs font-semibold text-[#b36b3c]">Event: {eventLabel(item)}</span>
                          )}
                          {item.href && (
                            <a
                              href={item.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-full bg-[#26352f] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#b36b3c]"
                            >
                              Open link ↗
                            </a>
                          )}
                          {hasContributionAction && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Contribution Action</span>}
                          {item.action_type === "respond" && <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">Response Action</span>}
                          {item.expires_at && <span className="rounded-full bg-[#f7f4ee] px-3 py-1 text-xs font-semibold text-[#617068]">Until {new Date(`${item.expires_at}T00:00:00`).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}</span>}
                        </div>
                        <h2 className="mt-3 text-2xl font-semibold">{item.title}</h2>
                        <p className="mt-4 text-base leading-7 text-[#26352f]">{item.text}</p>

                        {isDrive && drive && (
                          <div className="mt-5 rounded-2xl bg-[#f7f4ee] p-4">
                            <div className="flex items-center justify-between text-sm font-semibold text-[#26352f]">
                              <span>KES {Number(drive.total_raised || 0).toLocaleString("en-KE")}</span>
                              <span className="text-[#617068]">
                                of KES {Number(drive.target_amount || 0).toLocaleString("en-KE")} · {Number(drive.percentage_raised || 0).toFixed(1)}%
                              </span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dfdbd1]">
                              <div
                                className="h-full rounded-full bg-[#b36b3c]"
                                style={{ width: `${Math.min(100, Math.max(0, Number(drive.percentage_raised || 0)))}%` }}
                              />
                            </div>
                            {drive.end_date && (
                              <p className="mt-2 text-xs text-[#617068]">
                                Closes {new Date(`${drive.end_date}T00:00:00`).toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" })}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {item.attachment && (
                        <div className="mt-6 border-t border-[#dfdbd1] pt-4">
                          <AnnouncementAttachment
                            attachment={item.attachment}
                            name={item.attachment_name}
                            size={item.attachment_size}
                          />
                        </div>
                      )}

                      {isDrive && drive && (
                        <div className="mt-6 flex flex-wrap gap-3 border-t border-[#dfdbd1] pt-5">
                          <Link
                            href={driveGiveHref(drive)}
                            className="rounded-full bg-[#3d7146] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#335e3a]"
                          >
                            Give now
                          </Link>
                          <Link
                            href={`${driveGiveHref(drive)}&pledge=1`}
                            className="rounded-full border border-[#c9c5bb] bg-white px-6 py-2.5 text-sm font-bold text-[#26352f] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
                          >
                            Pledge
                          </Link>
                        </div>
                      )}
                    </>
                  );

                  return <article key={item.id} className={cardClasses}>{content}</article>;
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
