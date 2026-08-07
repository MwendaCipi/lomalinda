"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type Tab = "join" | "transfer_out";
type JoiningMode = "baptism" | "membership_transfer";
const inputClass = "mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]";

export default function EnrollPage() {
  const [tab, setTab] = useState<Tab>("join");
  const [step, setStep] = useState(1);
  const [joiningMode, setJoiningMode] = useState<JoiningMode>("baptism");
  const [form, setForm] = useState({ email: "", first_name: "", surname: "", phone_number: "", id_number: "", education_level: "", profession: "", date_of_birth: "", county_of_birth: "", destination_church: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  function selectTab(nextTab: Tab) { setTab(nextTab); setStep(1); setMessage(""); }
  function nextStep(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setStep(2); setMessage(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    try {
      const endpoint = tab === "transfer_out" ? `${API_URL}/api/members/transfers/` : `${API_URL}/api/members/auth/enrollment-request/`;
      const payload = tab === "transfer_out"
        ? { member_name: `${form.first_name} ${form.surname}`.trim(), transfer_type: "outgoing", other_church: form.destination_church, phone_number: form.phone_number, email: form.email }
        : { email: form.email, first_name: form.first_name, last_name: form.surname, phone_number: form.phone_number, joining_mode: joiningMode, id_number: form.id_number, education_level: form.education_level, profession: form.profession, date_of_birth: form.date_of_birth || null, county_of_birth: form.county_of_birth };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(Object.values(data).flat().join(" ") || "Unable to submit your request.");
      setMessage(tab === "transfer_out" ? "Your transfer-out request has been received. The church office will be in touch." : "Your request has been received. We will be in touch.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to submit your request."); }
    finally { setLoading(false); }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-[#f7f4ee] px-6 pb-16 pt-8 text-[#26352f] sm:py-10">
      <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8 lg:max-w-3xl">
        <Link href="/requests" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#b36b3c]"><span>&larr;</span><span>Back to Requests</span></Link>
        <h1 className="mt-2 text-3xl font-semibold">Membership requests</h1>
        <p className="mt-2 text-sm leading-6 text-[#617068]">Choose whether you would like to join us or request a transfer out.</p>
        <div className="mt-6 flex gap-1 rounded-2xl border border-[#dfdbd1] p-1">
          <button type="button" onClick={() => selectTab("join")} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === "join" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:bg-[#f7f4ee]"}`}>Join us</button>
          <button type="button" onClick={() => selectTab("transfer_out")} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === "transfer_out" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:bg-[#f7f4ee]"}`}>Transfer out</button>
        </div>

        {tab === "join" ? (
          <form onSubmit={step === 1 ? nextStep : submit} className="mt-6 space-y-5">
            {step === 1 ? <>
              <label className="block text-sm font-medium">Mode of joining<select value={joiningMode} onChange={(event) => setJoiningMode(event.target.value as JoiningMode)} className={inputClass}><option value="baptism">Baptism</option><option value="membership_transfer">Membership transfer</option></select></label>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm font-medium">First name<input required value={form.first_name} onChange={(event) => update("first_name", event.target.value)} className={inputClass} /></label>
                <label className="block text-sm font-medium">Surname<input required value={form.surname} onChange={(event) => update("surname", event.target.value)} className={inputClass} /></label>
                <label className="block text-sm font-medium">Phone number<input required placeholder="e.g. 07XX XXX XXX" value={form.phone_number} onChange={(event) => update("phone_number", event.target.value)} className={inputClass} /></label>
                <label className="block text-sm font-medium">Email address<input required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className={inputClass} /></label>
              </div>
              <button className="w-full rounded-full bg-[#26352f] px-5 py-3.5 font-medium text-white transition hover:bg-[#3d5148]">Next</button>
            </> : <>
              <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Additional details</p><p className="mt-1 text-xs text-[#617068]">These details help the church prepare for the next step.</p></div><button type="button" onClick={() => setStep(1)} className="text-xs font-semibold text-[#b36b3c]">Back</button></div>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm font-medium">ID number<input required value={form.id_number} onChange={(event) => update("id_number", event.target.value)} className={inputClass} /></label>
                <label className="block text-sm font-medium">Level of education<input required value={form.education_level} onChange={(event) => update("education_level", event.target.value)} className={inputClass} /></label>
                <label className="block text-sm font-medium">Profession<input required value={form.profession} onChange={(event) => update("profession", event.target.value)} className={inputClass} /></label>
                <label className="block text-sm font-medium">Date of birth<input required type="date" value={form.date_of_birth} onChange={(event) => update("date_of_birth", event.target.value)} className={inputClass} /></label>
                <label className="block text-sm font-medium sm:col-span-2">County of birth<input required value={form.county_of_birth} onChange={(event) => update("county_of_birth", event.target.value)} className={inputClass} /></label>
              </div>
              <button disabled={loading} className="w-full rounded-full bg-[#26352f] px-5 py-3.5 font-medium text-white transition hover:bg-[#3d5148] disabled:opacity-60">{loading ? "Sending..." : "Submit request"}</button>
            </>}
          </form>
        ) : <form onSubmit={submit} className="mt-6 space-y-5">
          <p className="rounded-2xl bg-[#f7f4ee] p-4 text-sm leading-6 text-[#617068]">For SDA members transferring from Loma Linda Church to another church.</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-medium">First name<input required value={form.first_name} onChange={(event) => update("first_name", event.target.value)} className={inputClass} /></label>
            <label className="block text-sm font-medium">Surname<input required value={form.surname} onChange={(event) => update("surname", event.target.value)} className={inputClass} /></label>
            <label className="block text-sm font-medium">Phone number<input required value={form.phone_number} onChange={(event) => update("phone_number", event.target.value)} className={inputClass} /></label>
            <label className="block text-sm font-medium">Email address<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className={inputClass} /></label>
            <label className="block text-sm font-medium sm:col-span-2">Destination church<input required value={form.destination_church} onChange={(event) => update("destination_church", event.target.value)} className={inputClass} /></label>
          </div>
          <button disabled={loading} className="w-full rounded-full bg-[#26352f] px-5 py-3.5 font-medium text-white transition hover:bg-[#3d5148] disabled:opacity-60">{loading ? "Sending..." : "Submit transfer request"}</button>
        </form>}
        {message && <p className="mt-5 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{message}</p>}
      </section>
    </main>
  );
}
