"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { localDate } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface DriveCard {
  id: number;
  name: string;
  title: string;
  description?: string;
  target_amount: number;
  total_raised: number;
  percentage_raised: number;
  donor_count: number;
  end_date?: string | null;
  is_active: boolean;
}

const fmtKES = (value: number) =>
  `KES ${Number(value || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

/** Whole days from today to the drive's last day, in the church's own day. */
function daysLeftLabel(endDate?: string | null): string | null {
  if (!endDate) return null;
  const days = Math.round(
    (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${localDate()}T00:00:00`).getTime()) / 86_400_000
  );
  if (days > 1) return `${days} days left`;
  if (days === 1) return "1 day left";
  if (days === 0) return "Closes today";
  return "Ended";
}

/**
 * Fund Drives, as a shelf of cards rather than the drive itself.
 *
 * Opening Fund Drives now shows every drive that is open, two cards to a row
 * even on a PC, each reading the drive at a glance — how far it has come, who
 * has given, how long is left. Tapping a card opens that drive's own page, the
 * same page a shared invite link opens directly: an invite carries the drive's
 * address (`/campaigns/<id>?ref=…`), so a recipient never passes through here.
 * The shell draws the page's name and description above, as it does everywhere.
 */
export default function SupportCampaignsPage() {
  const [drives, setDrives] = useState<DriveCard[] | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    fetch(`${API_URL}/api/members/campaigns/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const rows: DriveCard[] = Array.isArray(data) ? data : [];
        setDrives(rows.filter((drive) => drive.is_active !== false));
      })
      .catch(() => setDrives([]));
  }, []);

  return (
    <main className="min-h-screen md:h-screen bg-sand text-bark md:overflow-hidden">
      <div className="flex h-full md:h-full md:overflow-hidden">
        <div className="flex-1 min-w-0 h-full md:h-full p-4 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            {drives === null ? (
              <div className="rounded-3xl bg-white p-8 text-center text-sm font-medium text-moss shadow-sm ring-1 ring-sand-line">
                Loading fund drives…
              </div>
            ) : drives.length === 0 ? (
              <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-sand-line sm:p-12">
                <p className="text-sm font-semibold text-bark">No fund drives are open right now.</p>
                <p className="mt-1 text-xs text-moss">When the office opens one, it will appear here.</p>
                <Link
                  href="/give"
                  className="mt-5 inline-block rounded-full bg-sage px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-sage-deep"
                >
                  Go to Giving
                </Link>
              </div>
            ) : (
              // Two cards to a row even on a wide screen: a drive reads as a
              // card, not a ledger, so it is never stretched across the page.
              <div className="grid gap-5 sm:grid-cols-2">
                {drives.map((drive) => {
                  const remaining = daysLeftLabel(drive.end_date);
                  return (
                    <Link
                      key={drive.id}
                      href={`/support/campaigns/${drive.id}`}
                      className="group flex flex-col rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sand-line transition hover:-translate-y-0.5 hover:ring-ember/50 sm:p-6"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-base font-bold leading-snug text-bark transition group-hover:text-ember sm:text-lg">
                          {drive.title || drive.name}
                        </h2>
                        <span className="shrink-0 rounded-full bg-mist-soft px-2.5 py-1 text-[11px] font-bold text-sage-bright ring-1 ring-sage/20">
                          {drive.percentage_raised}%
                        </span>
                      </div>

                      {drive.description ? (
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-moss">{drive.description}</p>
                      ) : (
                        <p className="mt-2 text-sm italic text-moss-faint">No description written yet.</p>
                      )}

                      <div className="mt-auto pt-5">
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-sand-sheen">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-gold-deep via-sage to-sage-bright transition-all duration-700"
                            style={{ width: `${Math.min(100, drive.percentage_raised)}%` }}
                          />
                        </div>
                        <div className="mt-2 flex items-baseline justify-between gap-2">
                          <span className="text-sm font-bold text-bark">{fmtKES(drive.total_raised)}</span>
                          <span className="text-[11px] text-moss">of {fmtKES(drive.target_amount)} goal</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-sand-line pt-3 text-[11px] text-moss">
                          <span>
                            {drive.donor_count} donor{drive.donor_count === 1 ? "" : "s"}
                          </span>
                          {remaining && <span className="font-semibold">{remaining}</span>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
