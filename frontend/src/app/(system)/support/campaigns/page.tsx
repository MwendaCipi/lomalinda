"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { localDate } from "@/lib/dates";
import { PledgeModal } from "@/components/pledge-modal";
import { InKindGiftModal } from "@/components/in-kind-gift-modal";
import { DriveGiveModal } from "@/components/drive-give-modal";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface DriveCard {
  id: number;
  name: string;
  title: string;
  account_name?: string;
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
 * Opening Fund Drives shows every drive that is open, two cards to a row even
 * on a PC, each reading the drive at a glance — how far it has come, who has
 * given, how long is left. Every card carries the same giving trio the drive's
 * own page does — Pledge, In-kind, Give Money — so a member can act on a drive
 * without opening it first; the card's body still opens the drive's page, the
 * same page a shared invite link opens directly (`/fund-drives/<id>?ref=…`).
 * The shell draws the page's name and description above, as it does everywhere.
 */
export default function SupportCampaignsPage() {
  const [drives, setDrives] = useState<DriveCard[] | null>(null);
  // The drive a giving action was taken on. Pledge, in-kind and Give Money
  // each open their own modal over the shelf, so a member gives without
  // leaving the drive they were reading.
  const [pledgeDrive, setPledgeDrive] = useState<DriveCard | null>(null);
  const [inKindDrive, setInKindDrive] = useState<DriveCard | null>(null);
  const [giveDrive, setGiveDrive] = useState<DriveCard | null>(null);

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

  /** The drive's giving account, which the giving form answers to by name. */
  const givingPurpose = (drive: DriveCard) => drive.account_name || drive.name;

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
                  const label = drive.title || drive.name;
                  return (
                    <div
                      key={drive.id}
                      className="group flex flex-col rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sand-line transition hover:-translate-y-0.5 hover:ring-ember/50 sm:p-6"
                    >
                      {/* The card's body opens the drive; the actions below act
                          on it in place. */}
                      <Link href={`/fund-drives/${drive.id}`} className="flex flex-1 flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="text-base font-bold leading-snug text-bark transition group-hover:text-ember sm:text-lg">
                            {label}
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

                      {/* The giving trio, one tap from the shelf — the same
                          three actions the drive's own page offers. */}
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-sand-line pt-3">
                        <button
                          type="button"
                          onClick={() => setPledgeDrive(drive)}
                          className="inline-flex items-center justify-center rounded-full border border-sand-mute bg-white px-2 py-2.5 text-xs font-bold text-bark transition hover:border-ember hover:text-ember"
                        >
                          Pledge
                        </button>
                        <button
                          type="button"
                          onClick={() => setInKindDrive(drive)}
                          className="inline-flex items-center justify-center rounded-full border border-sand-mute bg-white px-2 py-2.5 text-xs font-bold text-bark transition hover:border-ember hover:text-ember"
                        >
                          In-kind
                        </button>
                        <button
                          type="button"
                          onClick={() => setGiveDrive(drive)}
                          className="inline-flex items-center justify-center rounded-full bg-sage px-2 py-2.5 text-xs font-bold text-white transition hover:bg-sage-deep"
                        >
                          Give Money
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pledge and in-kind giving open over the shelf, so the drive stays in
          view. A pledge is a drive record; the account is what it is towards. */}
      <PledgeModal
        open={Boolean(pledgeDrive)}
        onClose={() => setPledgeDrive(null)}
        target={
          pledgeDrive
            ? {
                id: pledgeDrive.id,
                title: pledgeDrive.title || pledgeDrive.name,
                kind: "campaign",
                support_account_display: pledgeDrive.account_name || pledgeDrive.name,
                event_date_to: pledgeDrive.end_date ?? null,
              }
            : null
        }
      />
      <InKindGiftModal
        open={Boolean(inKindDrive)}
        onClose={() => setInKindDrive(null)}
        defaultPurpose={inKindDrive ? givingPurpose(inKindDrive) : undefined}
        announcementTitle={inKindDrive ? inKindDrive.title || inKindDrive.name : undefined}
      />
      {giveDrive && (
        <DriveGiveModal
          onClose={() => setGiveDrive(null)}
          drive={{ purpose: givingPurpose(giveDrive), title: giveDrive.title || giveDrive.name }}
        />
      )}
    </main>
  );
}
