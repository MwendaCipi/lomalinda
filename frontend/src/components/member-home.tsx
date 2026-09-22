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
  Users,
  Wallet,
} from "lucide-react";
import { roleLabel } from "@/components/roles-combobox";

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

export function MemberHome() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
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
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [router]);

  const roles = me?.roles && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  const firstName = me?.first_name || me?.username || "there";
  const nonMemberRoles = roles.filter((r) => r !== "member");
  const isLeader = nonMemberRoles.length > 0;

  const has = (r: string) => roles.includes(r);
  const hasAny = (list: string[]) => list.some((r) => roles.includes(r));

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
    ...(hasAny(["treasurer", "finance"])
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

  // ── My giving stats ──────────────────────────────────────────────────────
  const completed = contributions.filter((c) => (c.status || "completed") === "completed");
  const thisYear = new Date().getFullYear().toString();
  const yearTotal = completed
    .filter((c) => (c.paid_at || c.created_at || "").startsWith(thisYear))
    .reduce((s, c) => s + Number(c.amount || 0), 0);
  const latest = completed[0];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#26352f] via-[#2c4038] to-[#26352f] px-6 py-7 text-white shadow-md sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#f1c89e]">{greeting}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{firstName}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {roles.map((r) => (
                <span
                  key={r}
                  className={`rounded-full px-3 py-1 text-[10px] font-bold capitalize ${
                    r === "member" ? "bg-white/10 text-white/80" : "bg-[#f1c89e] text-[#26352f]"
                  }`}
                >
                  {roleLabel(r)}
                </span>
              ))}
            </div>
          </div>
          <Link
            href="/give"
            className="inline-flex items-center gap-2 rounded-full bg-[#f1c89e] px-4 py-2.5 text-xs font-bold text-[#26352f] transition hover:bg-white"
          >
            <HandHeart className="h-4 w-4" />
            Give Now
          </Link>
        </div>

        {/* Stats strip */}
        <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Given this year</p>
            <p className="mt-1 text-lg font-bold text-white sm:text-xl">{fmtAmount(yearTotal)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Gifts recorded</p>
            <p className="mt-1 text-lg font-bold text-white sm:text-xl">{completed.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Notices</p>
            <p className="mt-1 text-lg font-bold text-white sm:text-xl">{notifications.length}</p>
          </div>
        </div>
      </section>

      {loading ? (
        <p className="mt-8 text-center text-sm text-[#617068]">Loading your dashboard…</p>
      ) : (
        <>
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
                  {hasAny(["treasurer", "finance"]) && (
                    <Link href="/administration/reconciliation" className="rounded-full border border-[#c9c5bb] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]">
                      Reconciliation
                    </Link>
                  )}
                  {hasAny(["elder", "admin", "clerk"]) && (
                    <Link href="/administration?tab=announcements" className="rounded-full border border-[#c9c5bb] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]">
                      Post announcement
                    </Link>
                  )}
                  {hasAny(["treasurer", "finance"]) && (
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
