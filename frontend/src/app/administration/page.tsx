"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GivingPurposeManager } from "@/components/giving-purpose-manager";
import { AnnouncementManager } from "@/components/announcement-manager";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const officialRoles = [
  "admin",
  "leader",
  "clerk",
  "elder",
  "youth_leader",
  "choir_director",
  "children_ministry",
  "men_ministry",
  "women_ministry",
  "chaplaincy",
  "finance",
  "treasurer",
];

type Transfer = { id: number; member_name: string; transfer_type: string; other_church: string; phone_number: string; status: string; created_at: string };
type BoardMeetingItem = { id: number; title: string; meeting_date: string; agenda: string; minutes: string; status: string };

export default function AdministrationPage() {
  const [status, setStatus] = useState<"loading" | "authorized" | "denied">(() =>
    typeof window !== "undefined" && !localStorage.getItem("access_token") ? "denied" : "loading"
  );
  const [profile, setProfile] = useState<{ username: string; role: string } | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [meetings, setMeetings] = useState<BoardMeetingItem[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "transfers" | "board" | "announcements" | "finance">("overview");

  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data && officialRoles.includes(data.role)) {
            setProfile(data);
            setStatus("authorized");

            // Fetch clerk & elder data
            if (["clerk", "elder", "admin", "leader"].includes(data.role)) {
              fetch(`${API_URL}/api/members/transfers/`, { headers: { Authorization: `Bearer ${token}` } })
                .then((res) => (res.ok ? res.json() : []))
                .then((t) => setTransfers(t))
                .catch(() => {});

              fetch(`${API_URL}/api/members/board-meetings/`, { headers: { Authorization: `Bearer ${token}` } })
                .then((res) => (res.ok ? res.json() : []))
                .then((m) => setMeetings(m))
                .catch(() => {});
            }
          } else {
            setStatus("denied");
          }
        })
        .catch(() => setStatus("denied"));
    }
  }, []);

  useEffect(() => {
    if (status === "denied") router.replace("/login");
  }, [router, status]);

  if (status === "loading") {
    return <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">Checking your administration access...</main>;
  }

  if (status === "denied") return null;

  const role = profile?.role ?? "member";
  const isClerk = ["clerk", "admin", "leader"].includes(role);
  const isElder = ["elder", "admin", "leader"].includes(role);
  const isYouthLeader = ["youth_leader", "admin"].includes(role);
  const isChoirDirector = ["choir_director", "admin"].includes(role);
  const isFinance = ["finance", "treasurer", "admin", "leader"].includes(role);

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 py-10 text-[#26352f] sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Church Administration</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Leader Portal</h1>
            <p className="mt-4 text-[#617068]">
              Welcome, <span className="font-semibold text-[#26352f]">{profile?.username}</span>. Role-based administration for your ministry duties.
            </p>
          </div>
          <span className="rounded-full bg-[#26352f] px-5 py-2.5 text-sm font-semibold capitalize text-white shadow-sm">
            {role.replaceAll("_", " ")}
          </span>
        </div>

        {/* Role Quick Modules Grid */}
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {isClerk && (
            <>
              <div
                onClick={() => setActiveTab("transfers")}
                className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 transition hover:border-[#b36b3c] hover:shadow-sm"
              >
                <h2 className="text-xl font-semibold">Membership Transfers</h2>
                <p className="mt-2 text-xs leading-5 text-[#617068]">Process incoming & outgoing church membership transfer requests.</p>
                <span className="mt-4 inline-block text-xs font-semibold text-[#b36b3c]">Manage Transfers &rarr;</span>
              </div>

              <div
                onClick={() => setActiveTab("board")}
                className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 transition hover:border-[#b36b3c] hover:shadow-sm"
              >
                <h2 className="text-xl font-semibold">Board Meetings</h2>
                <p className="mt-2 text-xs leading-5 text-[#617068]">Organize agenda, minutes, and shared reference materials.</p>
                <span className="mt-4 inline-block text-xs font-semibold text-[#b36b3c]">Board Records &rarr;</span>
              </div>
            </>
          )}

          {isElder && (
            <div
              onClick={() => setActiveTab("announcements")}
              className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 transition hover:border-[#b36b3c] hover:shadow-sm"
            >
              <h2 className="text-xl font-semibold">Announcements</h2>
              <p className="mt-2 text-xs leading-5 text-[#617068]">Manage Sabbath and weekly public announcements.</p>
              <span className="mt-4 inline-block text-xs font-semibold text-[#b36b3c]">Manage Announcements &rarr;</span>
            </div>
          )}

          {isYouthLeader && (
            <Link href="/ministries/adventist-youth" className="rounded-2xl border border-[#dfdbd1] bg-white p-6 transition hover:border-[#b36b3c] hover:shadow-sm">
              <h2 className="text-xl font-semibold">Youth Ministries</h2>
              <p className="mt-2 text-xs leading-5 text-[#617068]">Coordinate Youth Vespers, rallies, and Sabbath programs.</p>
              <span className="mt-4 inline-block text-xs font-semibold text-[#b36b3c]">Youth Portal &rarr;</span>
            </Link>
          )}

          {isChoirDirector && (
            <Link href="/ministries/ensemble" className="rounded-2xl border border-[#dfdbd1] bg-white p-6 transition hover:border-[#b36b3c] hover:shadow-sm">
              <h2 className="text-xl font-semibold">Choir & Music</h2>
              <p className="mt-2 text-xs leading-5 text-[#617068]">Manage choir roster, rehearsal schedules, and special music.</p>
              <span className="mt-4 inline-block text-xs font-semibold text-[#b36b3c]">Music Portal &rarr;</span>
            </Link>
          )}

          {isFinance && (
            <div
              onClick={() => setActiveTab("finance")}
              className="cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-6 transition hover:border-[#b36b3c] hover:shadow-sm"
            >
              <h2 className="text-xl font-semibold">Financial Stewardship</h2>
              <p className="mt-2 text-xs leading-5 text-[#617068]">Configure giving purposes and review tithes/offerings.</p>
              <span className="mt-4 inline-block text-xs font-semibold text-[#b36b3c]">Giving Purposes &rarr;</span>
            </div>
          )}
        </div>

        {/* Tab Content Sections */}
        {activeTab === "transfers" && isClerk && (
          <section className="mt-10 rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold">Membership Transfers (Church Clerk)</h2>
            <p className="mt-1 text-sm text-[#617068]">Incoming and outgoing membership transfer requests.</p>
            <div className="mt-6 divide-y divide-[#dfdbd1]">
              {transfers.length === 0 ? (
                <p className="py-4 text-sm text-[#617068]">No pending membership transfer requests.</p>
              ) : (
                transfers.map((t) => (
                  <div key={t.id} className="py-4 flex flex-wrap items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="font-semibold text-base">{t.member_name}</p>
                      <p className="text-xs text-[#617068]">
                        {t.transfer_type === "incoming" ? "Transferring into Loma Linda" : "Transferring out to"} &bull; {t.other_church}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#eef2ed] px-3 py-1 text-xs font-medium text-[#3d5148]">{t.status}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "board" && (isClerk || isElder) && (
          <section className="mt-10 rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold">Board Meetings & Minutes</h2>
            <p className="mt-1 text-sm text-[#617068]">Agenda, recorded minutes, and reference materials shared for church board meetings.</p>
            <div className="mt-6 space-y-4">
              {meetings.length === 0 ? (
                <p className="py-4 text-sm text-[#617068]">No church board meetings recorded yet.</p>
              ) : (
                meetings.map((m) => (
                  <div key={m.id} className="rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] p-5">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-semibold text-lg">{m.title}</h3>
                      <span className="text-xs text-[#617068]">{m.meeting_date}</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[#b36b3c]">Agenda</p>
                    <p className="mt-1 text-sm text-[#617068]">{m.agenda}</p>
                    {m.minutes && (
                      <>
                        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[#b36b3c]">Minutes</p>
                        <p className="mt-1 text-sm text-[#617068]">{m.minutes}</p>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* Announcements Manager */}
        {(activeTab === "announcements" || isElder) && (
          <div className="mt-10">
            <AnnouncementManager />
          </div>
        )}

        {/* Giving Purpose Manager */}
        {(activeTab === "finance" || isFinance) && (
          <div className="mt-10">
            <GivingPurposeManager />
          </div>
        )}
      </div>
    </main>
  );
}
