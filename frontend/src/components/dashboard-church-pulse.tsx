"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, UserRoundPlus, Users } from "lucide-react";
import { HorizontalBars } from "@/components/mini-charts";
import { dayFirst } from "@/lib/dates";
import { REQUESTS_TILE } from "@/config/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One desk's queue: what is still unanswered, and what arrived this month. */
type PulseDesk = {
  key: string;
  label: string;
  waiting: number;
  this_month: number;
};

type Pulse = {
  as_of: string;
  /** "September 2026" — the month the arrivals are counted over. */
  month_label: string;
  members: {
    /** Members who are still members; the disfellowshipped are counted apart. */
    total: number;
    friends: number;
    sabbath_school: number;
    ex_members: number;
    new_this_month: number;
    new_this_year: number;
    pending_invitations: number;
  };
  requests: {
    waiting_total: number;
    this_month_total: number;
    desks: PulseDesk[];
  };
};

const count = (value: number) => Number(value || 0).toLocaleString("en-KE");

const fmtDay = (iso: string) => dayFirst(iso);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-sand-deep bg-sand-card p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-moss">{label}</p>
      <p className="mt-1.5 text-sm font-bold text-bark sm:text-base">{value}</p>
      {hint && <p className="mt-1 text-[10px] text-moss">{hint}</p>}
    </div>
  );
}

/**
 * The congregation at a glance, for the offices that shepherd it.
 *
 * An elder opens the dashboard and should meet the church, not a spreadsheet:
 * how many people are on the roll and in its folds, and what the desks still
 * owe somebody an answer on. It counts people, never money — the finance panel
 * beside it does the money, and under its own gate — and it names nobody, so a
 * count of prayer requests can be read out without exposing who asked one.
 *
 * The numbers follow the same rule the requests desk and the rail's badge use
 * for "waiting" (see lib/requests), and the endpoint behind them refuses
 * anyone outside the church's offices, so a member or a department leader who
 * somehow reaches this component sees nothing.
 */
export function DashboardChurchPulse() {
  const [data, setData] = useState<Pulse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "hidden">("loading");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    let alive = true;
    fetch(`${API_URL}/api/members/dashboard/church-pulse/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? (res.json() as Promise<Pulse>) : null))
      .then((payload) => {
        if (!alive) return;
        // Refused, or the figures cannot be reached: the card simply is not
        // there. A dashboard is not the place to explain a permissions check.
        if (!payload) {
          setState("hidden");
          return;
        }
        setData(payload);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("hidden");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state !== "ready" || !data) return null;

  const { members, requests } = data;
  const waitingDesks = requests.desks.filter((desk) => desk.waiting > 0);

  return (
    <section className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-bark">
            <Users className="h-4 w-4 text-ember" /> The congregation
          </h2>
          <p className="mt-1 text-[11px] text-moss">
            The roll and the queues, counted on {fmtDay(data.as_of)}. Numbers about the church, not about
            anybody named in it.
          </p>
        </div>
        <Link
          href={REQUESTS_TILE.deskHref}
          className="rounded-full border border-sand-mute bg-white px-3.5 py-2 text-[11px] font-semibold text-bark hover:border-ember"
        >
          Open the requests desk
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Members" value={count(members.total)} hint="on the roll" />
        <Stat label="Friends" value={count(members.friends)} hint="friends of the church" />
        <Stat label="Sabbath School" value={count(members.sabbath_school)} hint="attendees on the roll" />
        <Stat label="Ex-members" value={count(members.ex_members)} hint="no longer on the roll" />
        <Stat
          label="New this month"
          value={count(members.new_this_month)}
          hint={`${count(members.new_this_year)} this year`}
        />
        <Stat label="Invitations" value={count(members.pending_invitations)} hint="awaiting acceptance" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-sand-deep bg-white p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
            <ClipboardList className="h-4 w-4 text-ember" /> Waiting on the desks
          </h3>
          <p className="mt-1 text-[11px] text-moss">
            {requests.waiting_total === 0
              ? "Every desk is clear — nothing is waiting for an answer."
              : `${count(requests.waiting_total)} ${
                  requests.waiting_total === 1 ? "request is" : "requests are"
                } still unanswered.`}
          </p>
          <div className="mt-4">
            <HorizontalBars
              items={waitingDesks.map((desk) => ({ label: desk.label, value: desk.waiting }))}
              formatValue={(value) => count(value)}
              emptyLabel="Nothing is waiting on any desk."
            />
          </div>
        </div>

        <div className="rounded-2xl border border-sand-deep bg-white p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
            <UserRoundPlus className="h-4 w-4 text-ember" /> What came in this month
          </h3>
          <p className="mt-1 text-[11px] text-moss">
            {requests.this_month_total === 0
              ? `Nothing has been asked for in ${data.month_label} yet.`
              : `${count(requests.this_month_total)} ${
                  requests.this_month_total === 1 ? "request" : "requests"
                } arrived in ${data.month_label}, whatever has happened to them since.`}
          </p>
          <ul className="mt-3">
            {requests.desks.map((desk) => (
              <li
                key={desk.key}
                className="flex items-baseline justify-between gap-3 border-b border-sand-line py-2 text-xs last:border-0"
              >
                <span className="truncate text-moss">{desk.label}</span>
                <span className={`shrink-0 font-bold ${desk.this_month > 0 ? "text-bark" : "text-moss-faint"}`}>
                  {count(desk.this_month)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
