"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  status?: string;
};

type Notification = {
  id: number;
  title: string;
  message: string;
  created_at: string;
};

const leaderboardRoles = new Set([
  "clerk",
  "elder",
  "treasurer",
  "finance",
  "youth_leader",
  "choir_director",
  "children_ministry",
  "men_ministry",
  "women_ministry",
  "chaplaincy",
  "leader",
  "admin",
]);

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
      .then((data: unknown) => setAnnouncements(Array.isArray(data) ? data.slice(0, 5) : []))
      .catch(() => setAnnouncements([]));

    fetch(`${API_URL}/api/members/contributions/`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => setContributions(Array.isArray(data) ? data.slice(0, 4) : []))
      .catch(() => setContributions([]));

    fetch(`${API_URL}/api/members/notifications/`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => setNotifications(Array.isArray(data) ? data.slice(0, 4) : []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [router]);

  const roles = me?.roles && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  const firstName = me?.first_name || me?.username || "there";
  const isLeader = roles.some((r) => r !== "member");

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

  const tiles = [
    { href: "/give", label: "Give & Offerings", desc: "Tithe, offerings and fund drives", icon: "💛" },
    { href: "/announcements", label: "Announcements", desc: "Church news and notices", icon: "📢" },
    { href: "/materials", label: "Lesson & Materials", desc: "Sabbath School and readings", icon: "📖" },
    { href: "/member", label: "My Profile", desc: "Details, giving history, reports", icon: "👤" },
    { href: "/requests", label: "Requests", desc: "Prayer, visitation, dedication", icon: "🙏" },
    ...(isLeader
      ? [{ href: "/administration", label: "Administration", desc: "Leadership tools and reports", icon: "🛠️" }]
      : []),
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      {/* Greeting */}
      <section className="rounded-3xl bg-[#26352f] px-6 py-7 text-white shadow-sm sm:px-8">
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
      </section>

      {loading ? (
        <p className="mt-8 text-center text-sm text-[#617068]">Loading your dashboard…</p>
      ) : (
        <>
          {/* Quick tiles */}
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="group rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm transition hover:border-[#b36b3c] hover:shadow-md"
              >
                <span className="text-2xl">{t.icon}</span>
                <h2 className="mt-2 text-sm font-bold text-[#26352f]">{t.label}</h2>
                <p className="mt-0.5 text-[11px] leading-snug text-[#617068]">{t.desc}</p>
              </Link>
            ))}
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            {/* Announcements */}
            <section className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-[#26352f]">Announcements</h2>
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
                  <h2 className="text-base font-bold text-[#26352f]">Recent Giving</h2>
                  <Link href="/member" className="text-xs font-semibold text-[#b36b3c] hover:underline">
                    History →
                  </Link>
                </div>
                <div className="mt-4 divide-y divide-[#eeeae2]">
                  {contributions.length === 0 ? (
                    <p className="py-6 text-center text-xs text-[#617068]">No giving recorded yet.</p>
                  ) : (
                    contributions.map((c) => (
                      <div key={c.id} className="flex items-baseline justify-between gap-3 py-3">
                        <div>
                          <p className="text-sm font-semibold text-[#26352f]">{fmtAmount(c.amount)}</p>
                          <p className="text-[11px] text-[#617068]">{c.purpose}</p>
                        </div>
                        <span className="shrink-0 text-[10px] text-[#617068]">{fmtDate(c.created_at)}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Notifications */}
              <section className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-base font-bold text-[#26352f]">Notifications</h2>
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

// Keep the import used above meaningful for future leaderboard work.
export { leaderboardRoles };
