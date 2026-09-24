"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  HandHeart,
  Megaphone,
  Receipt,
  ShieldCheck,
  UserRound,
  UserRoundCheck,
  Users,
  Wallet,
} from "lucide-react";
import { roleLabel } from "@/components/roles-combobox";
import { showAlert } from "@/lib/alerts";
import { AnnouncementAttachment } from "@/components/announcement-attachment";
import { DashboardAnalytics } from "@/components/dashboard-analytics";
import { GroupedBarChart } from "@/components/mini-charts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Me = {
  first_name: string;
  last_name: string;
  username: string;
  roles?: string[];
  role?: string;
};

type Announcement = {
  id: number;
  title: string;
  text: string;
  detail?: string;
  href?: string;
  attachment?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  created_at: string;
};

type Contribution = {
  id: number;
  amount: string;
  purpose: string;
  created_at: string;
  paid_at?: string;
  status?: string;
};

type Notification = {
  id: number;
  title: string;
  message: string;
  created_at: string;
};

type ProfileChange = {
  id: number;
  changes: Record<string, string | null>;
  proposed_by_name: string;
  proposed_at: string;
};

/** A member's own giving, bucketed into the last `months` calendar months. */
function monthlyGiving(contributions: Contribution[], months = 6) {
  const now = new Date();
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const buckets = Array.from({ length: months }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1);
    return { label: month.toLocaleDateString("en-GB", { month: "short" }), total: 0 };
  });

  contributions.forEach((row) => {
    const stamp = new Date(row.paid_at || row.created_at);
    if (Number.isNaN(stamp.getTime()) || stamp < firstMonth) return;
    const index =
      (stamp.getFullYear() - firstMonth.getFullYear()) * 12 + (stamp.getMonth() - firstMonth.getMonth());
    if (index >= 0 && index < buckets.length) buckets[index].total += Number(row.amount || 0);
  });

  return buckets;
}

/** Short chart labels: KES 12k, KES 1.2M, KES 850. */
function fmtCompactKes(value: number) {
  const amount = Number(value || 0);
  if (amount >= 1_000_000) return `KES ${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`;
  if (amount >= 1_000) return `KES ${Math.round(amount / 1_000)}k`;
  return `KES ${Math.round(amount)}`;
}

export function MemberHome() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [profileChange, setProfileChange] = useState<ProfileChange | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [encouragement, setEncouragement] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login?next=/dashboard");
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/members/me/`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setMe(data);
        if (!data) router.replace("/login?next=/dashboard");
      })
      .catch(() => router.replace("/login?next=/dashboard"));

    fetch(`${API_URL}/api/members/announcements/`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => setAnnouncements(Array.isArray(data) ? data.slice(0, 4) : []))
      .catch(() => setAnnouncements([]));

    fetch(`${API_URL}/api/members/contributions/`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => {
        const rows = Array.isArray(data) ? data : [];
        setContributions(rows);
      })
      .catch(() => setContributions([]));

    fetch(`${API_URL}/api/members/notifications/`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => setNotifications(Array.isArray(data) ? data.slice(0, 5) : []))
      .catch(() => setNotifications([]));

    // A proposed profile edit waits here for the member's own yes or no.
    fetch(`${API_URL}/api/members/me/profile-changes/`, { headers })
      .then((res) => (res.ok ? res.json() : { pending: false }))
      .then((data) => setProfileChange(data?.pending ? (data.change_request as ProfileChange) : null))
      .catch(() => setProfileChange(null))
      .finally(() => setLoading(false));

    // The church's own line of encouragement, editable in church settings.
    // Public read: it is greeting copy, not private data.
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setEncouragement(data?.dashboard_encouragement_line || ""))
      .catch(() => {});
  }, [router]);

  const roles = me?.roles && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  const firstName = me?.first_name || me?.username || "there";
  const nonMemberRoles = roles.filter((r) => r !== "member");
  const isLeader = nonMemberRoles.length > 0;

  const has = (r: string) => roles.includes(r);
  const hasAny = (list: string[]) => list.some((r) => roles.includes(r));
  // The whole church's money is for the officers who keep it; the endpoint
  // refuses anyone else, and members still get their own giving below.
  const seesChurchFinances = hasAny(["treasurer", "admin", "elder", "clerk"]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const fmtAmount = (a: string | number) =>
    `KES ${Number(a).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

  // ── Role-tailored quick tiles ─────────────────────────────────────────────
  const tiles = [
    { href: "/give", label: "Give & Offerings", desc: "Tithe, offerings and funds", icon: HandHeart },
    { href: "/announcements", label: "Announcements", desc: "Church news and notices", icon: Megaphone },
    { href: "/materials", label: "Lessons & Materials", desc: "Sabbath School readings", icon: BookOpen },
    { href: "/member", label: "My Profile", desc: "Details and giving history", icon: UserRound },
    { href: "/requests", label: "Requests", desc: "Prayer, visitation, dedication", icon: ClipboardList },
    // Leadership: deeper tools first-class on the dashboard.
    ...(hasAny(["treasurer", "admin"])
      ? [{ href: "/administration?tab=finance", label: "Treasury", desc: "Accounts, receipts, refunds", icon: Wallet }]
      : []),
    ...(hasAny(["elder", "admin", "clerk"])
      ? [{ href: "/administration?tab=users", label: "Members", desc: "Directory, roles, invites", icon: Users }]
      : []),
    ...(hasAny(["elder", "admin"])
      ? [{ href: "/administration?tab=board", label: "Board & Meetings", desc: "Agendas and minutes", icon: CalendarClock }]
      : []),
    ...(hasAny(["elder", "admin"])
      ? [{ href: "/administration?tab=settings", label: "Church Settings", desc: "Configuration", icon: ShieldCheck }]
      : []),
  ];

  // ── My giving ────────────────────────────────────────────────────────────
  const completed = contributions.filter((c) => (c.status || "completed") === "completed");
  const encouragementLine = encouragement.trim();

  const FIELD_LABELS: Record<string, string> = {
    first_name: "First name",
    last_name: "Last name",
    email: "Email",
    phone_number: "Phone number",
    whatsapp_number: "WhatsApp number",
    profession: "Profession",
    gender: "Sex",
    date_of_birth: "Date of birth",
    gifts: "Gifts & talents",
    disability: "Disability / special needs",
  };

  const decideProfileChange = async (decision: "approve" | "keep") => {
    setDeciding(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/members/me/profile-changes/decide/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not record your decision.");
      setProfileChange(null);
      showAlert(
        decision === "approve" ? "Profile updated" : "Details kept",
        data.detail || (decision === "approve" ? "Your profile has been updated." : "Your details stay as they are."),
        "success",
      );
    } catch (error) {
      showAlert("Not recorded", error instanceof Error ? error.message : "Could not record your decision.", "error");
    } finally {
      setDeciding(false);
    }
  };

  return (
    <main className="dashboard-page mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      {/* Hero — a greeting, who you are, and the church's line of encouragement.
          Money lives in the panels below: this card is where a member is greeted,
          not where their giving is totalled. */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#26352f] via-[#2c4038] to-[#26352f] px-6 py-7 text-white shadow-md sm:px-8">
        {/* The greeting is meant to read as one line on a phone as well as on a
            wide screen, so the size follows the viewport between the two ends
            instead of switching at a breakpoint and wrapping in between.
            On a wide screen the member's roles ride that same line, pushed to
            the panel's right edge; on a phone they drop underneath it. */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <h1 className="text-[clamp(1.3rem,6.2vw,2.25rem)] font-bold leading-tight tracking-tight">
            {greeting}, {firstName}.
          </h1>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
            {roles.map((r) => (
              <span
                key={r}
                className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize ${
                  r === "member" ? "bg-white/10 text-white/80" : "bg-[#f1c89e] text-[#26352f]"
                }`}
              >
                {roleLabel(r)}
              </span>
            ))}
          </div>
        </div>
        {encouragementLine && (
          <p className="mt-3 max-w-full text-sm font-medium leading-snug text-[#f1c89e] line-clamp-2 sm:text-base">
            {encouragementLine}
          </p>
        )}
      </section>

      {loading ? (
        <p className="mt-8 text-center text-sm text-[#617068]">Loading your dashboard…</p>
      ) : (
        <>
          {/* Church funds and giving analytics — officers only, and first: a
              treasurer opens this page for the church's money, not for the
              personal giving strip in the header above. */}
          {seesChurchFinances && <DashboardAnalytics />}

          {/* A proposed profile edit, awaiting the member's own approval.
              Nothing on their record moves until they choose here. */}
          {profileChange && (
            <section
              aria-live="polite"
              className="mt-6 rounded-2xl border border-[#e0c9a8] bg-[#fdf8ef] p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-center gap-2">
                <UserRoundCheck className="h-4 w-4 text-[#b36b3c]" />
                <h2 className="text-base font-bold text-[#26352f]">The church office proposed an update to your profile</h2>
              </div>
              <p className="mt-1 text-xs text-[#617068]">
                Proposed by {profileChange.proposed_by_name}. Nothing changes until you approve it.
              </p>
              <ul className="mt-3 space-y-1.5">
                {Object.entries(profileChange.changes).map(([field, value]) => (
                  <li key={field} className="text-sm text-[#26352f]">
                    <span className="font-semibold">{FIELD_LABELS[field] || field}:</span>{" "}
                    <span className="text-[#617068]">{value === null || value === "" ? "—" : String(value)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={deciding}
                  onClick={() => decideProfileChange("approve")}
                  className="rounded-full bg-[#26352f] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#b36b3c] disabled:opacity-60"
                >
                  {deciding ? "Saving…" : "Approve update"}
                </button>
                <button
                  type="button"
                  disabled={deciding}
                  onClick={() => decideProfileChange("keep")}
                  className="rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-xs font-semibold text-[#617068] transition hover:border-[#b36b3c] disabled:opacity-60"
                >
                  Keep my details
                </button>
              </div>
            </section>
          )}

          {/* Quick tiles */}
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tiles.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="group rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef2ed] text-[#26352f] transition group-hover:bg-[#f1c89e]">
                  <t.icon className="h-4 w-4" />
                </span>
                <h2 className="mt-2.5 text-sm font-bold text-[#26352f]">{t.label}</h2>
                <p className="mt-0.5 text-[11px] leading-snug text-[#617068]">{t.desc}</p>
              </Link>
            ))}
          </section>

          {/* Leadership strip */}
          {isLeader && (
            <section className="mt-4 rounded-2xl border border-[#e5dfd2] bg-[#faf7f0] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-[#26352f]">Leadership shortcuts</h2>
                  <p className="text-[11px] text-[#617068]">
                    Tailored for: {nonMemberRoles.map((r) => roleLabel(r)).join(", ")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href="/administration" className="rounded-full border border-[#c9c5bb] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]">
                    Open Administration
                  </Link>
                  {hasAny(["treasurer", "admin"]) && (
                    <Link href="/administration/reconciliation" className="rounded-full border border-[#c9c5bb] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]">
                      Reconciliation
                    </Link>
                  )}
                  {hasAny(["elder", "admin", "clerk"]) && (
                    <Link href="/administration?tab=announcements" className="rounded-full border border-[#c9c5bb] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]">
                      Post announcement
                    </Link>
                  )}
                  {hasAny(["treasurer", "admin"]) && (
                    <Link href="/support/budget" className="rounded-full border border-[#c9c5bb] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]">
                      Church budget
                    </Link>
                  )}
                  {hasAny(["elder", "admin"]) && (
                    <Link href="/requests" className="rounded-full border border-[#c9c5bb] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]">
                      Review requests
                    </Link>
                  )}
                </div>
              </div>
            </section>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            {/* Announcements */}
            <section className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-bold text-[#26352f]">
                  <Megaphone className="h-4 w-4 text-[#b36b3c]" /> Announcements
                </h2>
                <Link href="/announcements" className="text-xs font-semibold text-[#b36b3c] hover:underline">
                  View all →
                </Link>
              </div>
              <div className="mt-4 divide-y divide-[#eeeae2]">
                {announcements.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[#617068]">No announcements right now.</p>
                ) : (
                  announcements.map((a) => (
                    <Link key={a.id} href={a.href || "/announcements"} className="block py-3 group">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-sm font-semibold text-[#26352f] group-hover:text-[#b36b3c]">{a.title}</h3>
                        <span className="shrink-0 text-[10px] text-[#617068]">{fmtDate(a.created_at)}</span>
                      </div>
                      {a.text && <p className="mt-1 line-clamp-2 text-xs text-[#617068]">{a.text}</p>}
                      <AnnouncementAttachment
                        attachment={a.attachment}
                        name={a.attachment_name}
                        size={a.attachment_size}
                        linked={false}
                        compact
                        className="mt-2"
                      />
                    </Link>
                  ))
                )}
              </div>
            </section>

            <div className="grid gap-6">
              {/* Recent giving */}
              <section className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-base font-bold text-[#26352f]">
                    <Receipt className="h-4 w-4 text-[#b36b3c]" /> Recent Giving
                  </h2>
                  <Link href="/member" className="text-xs font-semibold text-[#b36b3c] hover:underline">
                    History →
                  </Link>
                </div>
                {completed.length > 0 && (
                  <div className="mt-4 rounded-xl border border-[#e5dfd2] bg-[#faf9f5] p-3">
                    <p className="text-[11px] font-semibold text-[#26352f]">Your giving, last 6 months</p>
                    <div className="mt-2">
                      <GroupedBarChart
                        groups={monthlyGiving(completed).map((bucket) => ({
                          label: bucket.label,
                          values: [bucket.total],
                        }))}
                        series={[{ label: "My giving", color: "#5f8067" }]}
                        formatValue={fmtCompactKes}
                        height={150}
                        emptyLabel="No giving recorded in the last 6 months."
                      />
                    </div>
                  </div>
                )}
                <div className="mt-4 divide-y divide-[#eeeae2]">
                  {completed.length === 0 ? (
                    <p className="py-6 text-center text-xs text-[#617068]">No giving recorded yet.</p>
                  ) : (
                    completed.slice(0, 4).map((c) => (
                      <div key={c.id} className="flex items-baseline justify-between gap-3 py-3">
                        <div>
                          <p className="text-sm font-semibold text-[#26352f]">{fmtAmount(c.amount)}</p>
                          <p className="text-[11px] text-[#617068]">{c.purpose}</p>
                        </div>
                        <span className="shrink-0 text-[10px] text-[#617068]">{fmtDate(c.paid_at || c.created_at)}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Notifications */}
              <section className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-base font-bold text-[#26352f]">
                    <Bell className="h-4 w-4 text-[#b36b3c]" /> Notifications
                  </h2>
                  <ChevronRight className="h-4 w-4 text-[#c9c5bb]" />
                </div>
                <div className="mt-4 divide-y divide-[#eeeae2]">
                  {notifications.length === 0 ? (
                    <p className="py-6 text-center text-xs text-[#617068]">You're all caught up.</p>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm font-semibold text-[#26352f]">{n.title}</p>
                          <span className="shrink-0 text-[10px] text-[#617068]">{fmtDate(n.created_at)}</span>
                        </div>
                        {n.message && <p className="mt-1 line-clamp-2 text-xs text-[#617068]">{n.message}</p>}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
