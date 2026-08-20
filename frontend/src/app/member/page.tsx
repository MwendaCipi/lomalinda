"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { kenyaCounties } from "@/config/kenya-counties";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type Contribution = { id: string; amount: string; currency: string; purpose: string; status: string; created_at: string };
type Details = { date_of_birth: string; county_of_birth: string; education_level: string; profession: string; current_church: string };

export default function MemberPage() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [details, setDetails] = useState<Details | null>(null);
  const [token] = useState(() => typeof window !== "undefined" ? localStorage.getItem("access_token") : null);
  const [message, setMessage] = useState(token ? "Loading your giving history..." : "Sign in to view your giving history.");
  const [detailsMessage, setDetailsMessage] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  useEffect(() => { if (!token) return; const headers = { Authorization: `Bearer ${token}` }; Promise.all([fetch(`${API_URL}/api/members/contributions/`, { headers }), fetch(`${API_URL}/api/members/me/enrollment-details/`, { headers })]).then(async ([contributionsResponse, detailsResponse]) => { if (!contributionsResponse.ok) throw new Error("Your session may have expired."); setContributions(await contributionsResponse.json()); if (detailsResponse.ok) setDetails(await detailsResponse.json()); }).then(() => setMessage("")) .catch((error) => setMessage(error.message)); }, [token]);

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !details) return;
    setSavingDetails(true);
    setDetailsMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/me/enrollment-details/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(details)
      });
      if (!response.ok) throw new Error("Unable to save your details.");
      setDetails(await response.json());
      const successMsg = "Your additional details have been saved.";
      setDetailsMessage(successMsg);
      showAlert("Details Saved", successMsg, "success");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to save your details.";
      setDetailsMessage(errorMsg);
      showAlert("Error", errorMsg, "error");
    } finally {
      setSavingDetails(false);
    }
  }

  return <main className="min-h-screen bg-[#f7f4ee] px-6 py-10 text-[#26352f] sm:py-16"><div className="mx-auto max-w-5xl"><div className="flex items-center justify-between gap-5"><div><p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Member space</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Your giving history</h1></div><Link href="/give" className="rounded-full bg-[#b36b3c] px-5 py-3 text-sm font-semibold text-white hover:bg-[#96552e]">Give now</Link></div><div className="mt-6 flex flex-wrap gap-5"><Link href="/member/reports" className="text-sm font-semibold text-[#b36b3c]">View church financial reports &rarr;</Link><Link href="/community/welfare" className="text-sm font-semibold text-[#b36b3c]">Church welfare &rarr;</Link><Link href="/announcements" className="text-sm font-semibold text-[#b36b3c]">Member announcements &rarr;</Link></div>{details && <form onSubmit={saveDetails} className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1]"><h2 className="text-xl font-semibold">Additional church details</h2><p className="mt-2 text-sm leading-6 text-[#617068]">Complete these details when convenient. A church official may also update them, and your national ID will be collected and verified by an official later.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Date of birth<input type="date" value={details.date_of_birth || ""} onChange={(event) => setDetails({ ...details, date_of_birth: event.target.value })} className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5" /></label><label className="block text-sm font-medium">County of birth<select value={details.county_of_birth || ""} onChange={(event) => setDetails({ ...details, county_of_birth: event.target.value })} className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5"><option value="">Select county</option>{kenyaCounties.map((county) => <option key={county} value={county}>{county}</option>)}</select></label><label className="block text-sm font-medium">Level of education<input value={details.education_level || ""} onChange={(event) => setDetails({ ...details, education_level: event.target.value })} className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5" /></label><label className="block text-sm font-medium">Profession<input value={details.profession || ""} onChange={(event) => setDetails({ ...details, profession: event.target.value })} className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5" /></label>{details.current_church !== undefined && <label className="block text-sm font-medium sm:col-span-2">Current church<input value={details.current_church || ""} onChange={(event) => setDetails({ ...details, current_church: event.target.value })} className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5" /></label>}</div><button disabled={savingDetails} className="mt-5 rounded-full bg-[#5f8067] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{savingDetails ? "Saving..." : "Save details"}</button>{detailsMessage && <p className="mt-3 text-sm text-[#617068]">{detailsMessage}</p>}</form>}<div className="mt-10 space-y-4">{contributions.map((item) => <article key={item.id} className="flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{item.purpose}</p><p className="mt-1 text-sm text-[#617068]">{new Date(item.created_at).toLocaleDateString()}</p></div><div className="sm:text-right"><p className="text-xl font-semibold">{item.currency} {Number(item.amount).toLocaleString()}</p><p className="mt-1 text-sm capitalize text-[#617068]">{item.status}</p></div></article>)}{message && <div className="rounded-2xl bg-white p-6 text-[#617068] shadow-sm ring-1 ring-[#dfdbd1]">{message} {message.includes("Sign in") && <Link href="/login" className="font-semibold text-[#b36b3c]">Sign in &rarr;</Link>}</div>}</div></div></main>;
}
