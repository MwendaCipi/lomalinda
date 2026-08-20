"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function PartnershipRequestPage() {
  const [organization, setOrganization] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [partnershipType, setPartnershipType] = useState("community_outreach");
  const [proposal, setProposal] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/members/support-submissions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_type: "partnership",
          category: partnershipType,
          content: `Organization: ${organization}\nContact person: ${contactName}\n\n${proposal}`,
          name: contactName,
          phone_number: phoneNumber,
          email,
        }),
      });
      if (!response.ok) throw new Error();
      setMessage({ type: "success", text: "Thank you. Your partnership request has been received, and our team will be in touch." });
      setOrganization(""); setContactName(""); setEmail(""); setPhoneNumber(""); setProposal("");
    } catch {
      setMessage({ type: "error", text: "We could not submit your request. Please check the form and try again." });
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 outline-none focus:border-[#b36b3c]";
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 py-8 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/requests" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"><span>&larr;</span><span>Back to Requests</span></Link>
        <div className="mt-5"><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Partnership request</h1><p className="mt-2 max-w-2xl leading-6 text-[#617068]">Tell us how your organization, group, or business would like to partner with Loma Linda SDA Church.</p></div>
        <form onSubmit={submitRequest} className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#dfdbd1] sm:p-7">
          {message && <div className={`mb-5 rounded-xl p-4 text-sm ${message.type === "success" ? "bg-[#eef2ed] text-[#26352f]" : "bg-red-50 text-red-700"}`}>{message.text}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium sm:col-span-2">Organization or group<input required maxLength={160} value={organization} onChange={(event) => setOrganization(event.target.value)} className={inputClass} placeholder="Organization name" /></label>
            <label className="block text-sm font-medium">Contact person<input required maxLength={160} value={contactName} onChange={(event) => setContactName(event.target.value)} className={inputClass} placeholder="Full name" /></label>
            <label className="block text-sm font-medium">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="you@example.com" /></label>
            <label className="block text-sm font-medium">Phone number (optional)<input type="tel" maxLength={40} value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} className={inputClass} placeholder="07XX XXX XXX" /></label>
            <label className="block text-sm font-medium">Partnership area<select value={partnershipType} onChange={(event) => setPartnershipType(event.target.value)} className={inputClass}><option value="community_outreach">Community outreach</option><option value="ministry">Ministry collaboration</option><option value="sponsorship">Sponsorship or funding</option><option value="services">Services or resources</option><option value="other">Other</option></select></label>
            <label className="block text-sm font-medium sm:col-span-2">Partnership proposal<textarea required minLength={5} rows={6} value={proposal} onChange={(event) => setProposal(event.target.value)} className={inputClass} placeholder="Describe your idea, goals, and how you would like to work together." /></label>
          </div>
          <button disabled={loading} className="mt-6 w-full rounded-full bg-[#b36b3c] px-5 py-3 font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60">{loading ? "Submitting..." : "Submit partnership request"}</button>
        </form>
      </div>
    </main>
  );
}
