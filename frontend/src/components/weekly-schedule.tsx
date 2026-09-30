"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { meetingDay, meetingHours, type WeeklyMeeting } from "@/lib/gathering";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * The week at a glance: one card per weekly meeting, in the order the church
 * meets. The times used to be three strings in Church Settings; they are now
 * the records the personal ministries leader keeps, so a change there shows up
 * on the website without a redeploy and without a clerk.
 */
export function WeeklySchedule() {
  const [meetings, setMeetings] = useState<WeeklyMeeting[] | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/members/weekly-meetings/`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setMeetings(Array.isArray(data?.meetings) ? data.meetings : []))
      .catch(() => setMeetings([]));
  }, []);

  return (
    <section id="calendar" className="border-y border-sand-line bg-white/60 px-6 py-16 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ember">Weekly calendar</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Connect &amp; worship with us</h2>
          </div>
          <Link href="/calendar" className="text-sm font-semibold text-ember hover:underline">
            See all Sabbaths &rarr;
          </Link>
        </div>

        <div className="mt-10 grid gap-8 border-t border-sand-line pt-6 sm:grid-cols-2 lg:grid-cols-3">
          {(meetings || []).map((meeting) => (
            <article key={meeting.id}>
              <p className="text-sm font-semibold text-ember">{meetingDay(meeting)}</p>
              <h3 className="mt-3 text-xl font-semibold">{meeting.title}</h3>
              <p className="mt-2 text-sm font-medium text-bark">{meetingHours(meeting)}</p>
              <p className="mt-1 text-sm text-moss">
                {meeting.online ? "Online" : meeting.place || "Church grounds, Loma Linda, Meru"}
              </p>
            </article>
          ))}
          {meetings !== null && meetings.length === 0 && (
            <p className="text-sm text-moss">
              The week&apos;s meetings are still being set up — check the{" "}
              <Link href="/calendar" className="font-semibold text-ember hover:underline">
                church calendar
              </Link>{" "}
              for what is on.
            </p>
          )}
        </div>

        <p className="mt-8 text-sm text-moss">
          Visiting for the first time? Everything you need — programmes, times and what to expect — is on the{" "}
          <Link href="/calendar" className="font-semibold text-ember hover:underline">
            church calendar
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
