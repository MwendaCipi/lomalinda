"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type Tab = "join" | "transfer_out";
type JoiningMode = "baptism" | "membership_transfer" | "friend";
const inputClass = "mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]";
declare global { interface Window { google?: { accounts: { id: { initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void; prompt: () => void } } } } }

export default function EnrollPage() {
  const [tab, setTab] = useState<Tab>("join");
  const [joiningMode, setJoiningMode] = useState<JoiningMode>("baptism");
  const [form, setForm] = useState({ email: "", first_name: "", surname: "", phone_number: "", current_church: "", destination_church: "", transfer_reason: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  function selectTab(nextTab: Tab) { setTab(nextTab); setMessage(""); }

  useEffect(() => {
    if (document.querySelector("script[data-google-identity]") || !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return;
    const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true; script.dataset.googleIdentity = "true"; document.head.appendChild(script);
  }, []);

  function startGoogleVerification() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) { showAlert("Verification unavailable", "Google OAuth has not been configured yet.", "error"); return; }
    if (!window.google) { showAlert("Verification unavailable", "Google verification is still loading. Please try again.", "error"); return; }
    window.google.accounts.id.initialize({ client_id: clientId, callback: completeGoogleVerification });
    window.google.accounts.id.prompt();
  }

  async function completeGoogleVerification(response: { credential: string }) {
    setLoading(true); setMessage("");
    try {
      const result = await fetch(`${API_URL}/api/members/auth/enrollment/oauth-verify/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, last_name: form.surname, joining_mode: joiningMode, credential: response.credential }) });
      const data = await result.json();
      if (!result.ok) throw new Error(Object.values(data).flat().join(" ") || "Google verification failed.");
      window.location.href = `/enroll/confirm?token=${encodeURIComponent(data.token)}`;
    } catch (error) { const text = error instanceof Error ? error.message : "Google verification failed."; setMessage(text); showAlert("Verification error", text, "error"); }
    finally { setLoading(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    try {
      const endpoint = `${API_URL}/api/members/transfers/`;
      const payload = tab === "transfer_out"
        ? { member_name: `${form.first_name} ${form.surname}`.trim(), transfer_type: "outgoing", other_church: form.destination_church, reason: form.transfer_reason, phone_number: form.phone_number, email: form.email }
        : {};
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(Object.values(data).flat().join(" ") || "Unable to submit your request.");
      const text = tab === "transfer_out" ? "Your transfer-out request has been received. The church office will be in touch." : "Your request has been received. We will be in touch.";
      setMessage(text); showAlert("Request received", text, "success");
    } catch (error) { const text = error instanceof Error ? error.message : "Unable to submit your request."; setMessage(text); showAlert("Request error", text, "error"); }
    finally { setLoading(false); }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-[#f7f4ee] px-6 pb-16 pt-8 text-[#26352f] sm:py-10">
      <section className="w-full max-w-md rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#dfdbd1] sm:p-7 lg:max-w-3xl">
        <Link href="/requests" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#b36b3c]"><span>&larr;</span><span>Back to Requests</span></Link>
        <h1 className="mt-2 text-3xl font-semibold">Membership requests</h1>
        <p className="mt-2 text-sm leading-6 text-[#617068]">Choose whether you would like to join us or request a transfer out.</p>
        <div className="mt-5 flex gap-1 rounded-2xl border border-[#dfdbd1] p-1">
          <button type="button" onClick={() => selectTab("join")} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === "join" ? "bg-[#5f8067] text-white shadow-sm" : "text-[#617068] hover:bg-[#f7f4ee]"}`}>Join us</button>
          <button type="button" onClick={() => selectTab("transfer_out")} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === "transfer_out" ? "bg-[#9a741c] text-white shadow-sm" : "text-[#617068] hover:bg-[#f7f4ee]"}`}>Transfer out</button>
        </div>

        {tab === "join" ? (
          <form onSubmit={(event) => { event.preventDefault(); startGoogleVerification(); }} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Mode of joining<select value={joiningMode} onChange={(event) => setJoiningMode(event.target.value as JoiningMode)} className={inputClass}><option value="baptism">Baptism</option><option value="membership_transfer">Membership transfer</option><option value="friend">Friend of Loma Linda</option></select></label>
              <label className="block text-sm font-medium">First name<input required value={form.first_name} onChange={(event) => update("first_name", event.target.value)} className={inputClass} /></label>
              <label className="block text-sm font-medium">Surname<input required value={form.surname} onChange={(event) => update("surname", event.target.value)} className={inputClass} /></label>
              <label className="block text-sm font-medium">Phone number<input required placeholder="e.g. 07XX XXX XXX" value={form.phone_number} onChange={(event) => update("phone_number", event.target.value)} className={inputClass} /></label>
              <label className="block text-sm font-medium">Email address<input required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className={inputClass} /></label>
              {joiningMode === "friend" && <label className="block text-sm font-medium sm:col-span-2">Current church<input required value={form.current_church} onChange={(event) => update("current_church", event.target.value)} className={inputClass} placeholder="Name of the church you currently attend" /></label>}
            </div>
            <p className="text-xs leading-5 text-[#617068]">Additional membership details, including national ID, will be collected later by an authorized church official or through your account.</p>
            <div className="grid gap-3 sm:grid-cols-2"><button type="submit" disabled={loading} className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#5f8067] px-5 font-medium text-white transition hover:bg-[#4d6d55] sm:col-start-2 disabled:opacity-60">{loading ? "Verifying..." : "Verify with Google"}</button></div>
            {message && <p className="rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{message}</p>}
          </form>
        ) : <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">First name<input required value={form.first_name} onChange={(event) => update("first_name", event.target.value)} className={inputClass} /></label>
            <label className="block text-sm font-medium">Surname<input required value={form.surname} onChange={(event) => update("surname", event.target.value)} className={inputClass} /></label>
            <label className="block text-sm font-medium">Phone number<input required value={form.phone_number} onChange={(event) => update("phone_number", event.target.value)} className={inputClass} /></label>
            <label className="block text-sm font-medium">Email address<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className={inputClass} /></label>
            <label className="block text-sm font-medium sm:col-span-2">Destination church<input required value={form.destination_church} onChange={(event) => update("destination_church", event.target.value)} className={inputClass} /></label>
            <label className="block text-sm font-medium sm:col-span-2">Reason for transfer<textarea required rows={3} value={form.transfer_reason} onChange={(event) => update("transfer_reason", event.target.value)} className={inputClass} placeholder="Tell us why you are requesting the transfer" /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2"><button disabled={loading} className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#9a741c] px-5 font-medium text-white transition hover:bg-[#7c5d16] disabled:opacity-60 sm:col-start-2">{loading ? "Sending..." : "Request transfer out"}</button></div>
        </form>}
        {message && <p className="mt-5 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{message}</p>}
      </section>
    </main>
  );
}
