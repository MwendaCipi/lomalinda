"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const officialRoles = ["admin", "leader", "finance", "choir_director", "children_ministry", "men_ministry", "women_ministry", "chaplaincy"];
const tools = [{ title: "Calendar", text: "Review church events, programs, and department calendars.", href: "/calendar" }, { title: "Financial reports", text: "Review public budgets and published financial reports.", href: "/financial" }, { title: "Ministries", text: "Open ministry pages and review ministry information.", href: "/ministries" }, { title: "Community care", text: "Review the community support and welfare areas.", href: "/community" }];

export default function AdministrationPage() {
  const [status, setStatus] = useState<"loading" | "authorized" | "denied">(() => typeof window !== "undefined" && !localStorage.getItem("access_token") ? "denied" : "loading");
  const [profile, setProfile] = useState<{ username: string; role: string } | null>(null);
  const router = useRouter();
  useEffect(() => { const token = localStorage.getItem("access_token"); if (token) fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() : null).then((data) => { if (data && officialRoles.includes(data.role)) { setProfile(data); setStatus("authorized"); } else setStatus("denied"); }).catch(() => setStatus("denied")); }, []);
  useEffect(() => { if (status === "denied") router.replace("/login"); }, [router, status]);
  if (status === "loading") return <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">Checking your administration access...</main>;
  if (status === "denied") return null;
  return <main className="min-h-screen bg-[#f7f4ee] px-6 py-12 text-[#26352f] sm:py-16"><div className="mx-auto max-w-6xl"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Frontend administration</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Church administration</h1><p className="mt-4 text-[#617068]">Welcome, {profile?.username}. Manage church information and stay connected to the areas you serve.</p></div><span className="rounded-full bg-[#eef2ed] px-4 py-2 text-sm font-semibold capitalize text-[#3d5148]">{profile?.role.replaceAll("_", " ")}</span></div><div className="mt-12 grid gap-5 md:grid-cols-2">{tools.map((tool) => <Link key={tool.href} href={tool.href} className="rounded-2xl border border-[#dfdbd1] bg-white p-7 transition hover:-translate-y-0.5 hover:border-[#b36b3c] hover:shadow-sm"><h2 className="text-2xl font-semibold">{tool.title}</h2><p className="mt-3 text-sm leading-6 text-[#617068]">{tool.text}</p><span className="mt-5 inline-block text-sm font-semibold text-[#b36b3c]">Open &rarr;</span></Link>)}</div><p className="mt-10 rounded-2xl border border-[#dfdbd1] bg-white p-6 text-sm leading-6 text-[#617068]">Management actions will be available here according to your church role. Django&apos;s <code>/admin/</code> area remains reserved for superusers and technical administration.</p></div></main>;
}
