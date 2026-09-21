"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { RequestsSidebar } from "@/components/sidebars/requests-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type PartnershipRecord = {
  id: number;
  name?: string;
  category?: string;
  content?: string;
  phone_number?: string;
  email?: string;
  created_at?: string;
  status?: string;
};

export default function PartnershipRequestPage() {
  const [partnerships, setPartnerships] = useState<PartnershipRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fetchingList, setFetchingList] = useState(true);

  const [organization, setOrganization] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [partnershipType, setPartnershipType] = useState("community_outreach");
  const [proposal, setProposal] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchPartnerships = async () => {
    setFetchingList(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_URL}/api/members/support-submissions/?type=partnership`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPartnerships(Array.isArray(data) ? data : []);
      } else {
        setPartnerships([]);
      }
    } catch {
      setPartnerships([]);
    } finally {
      setFetchingList(false);
    }
  };

  useEffect(() => {
    fetchPartnerships();
  }, []);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const cleanPhone = phoneNumber ? phoneNumber.replace(/\D/g, "") : "";
    if (cleanPhone && cleanPhone.length !== 10) {
      const errorText = "Please enter a valid 10-digit phone number (e.g., 0712345678).";
      setMessage({ type: "error", text: errorText });
      showAlert("Invalid Phone Number", errorText, "warning");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/members/support-submissions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_type: "partnership",
          category: partnershipType,
          content: `Organization: ${organization}\nContact person: ${contactName}\n\n${proposal}`,
          name: contactName,
          phone_number: cleanPhone,
          email,
        }),
      });
      if (!response.ok) throw new Error();
      const successText = "Thank you. Your partnership request has been received, and our team will be in touch.";
      setMessage({ type: "success", text: successText });
      showAlert("Partnership Request Received", successText, "success");
      setOrganization(""); setContactName(""); setEmail(""); setPhoneNumber(""); setProposal("");
      setShowForm(false);
      fetchPartnerships();
    } catch {
      const errorText = "We could not submit your request. Please check the form and try again.";
      setMessage({ type: "error", text: errorText });
      showAlert("Submission Error", errorText, "error");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b36b3c]";
  return (
    <main className="min-h-screen bg-white text-[#26352f]">
      <div className="flex min-h-[calc(100vh-4rem)]">
        <RequestsSidebar />
        <div className="flex-1 min-w-0 w-full min-h-[calc(100vh-4rem)] bg-white p-5 sm:p-8 lg:p-10 border-b border-[#dfdbd1]">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Partnership Requests</h1>
              <p className="mt-1 text-sm text-[#617068]">
                Tell us how your organization, group, or business would like to partner with Loma Linda SDA Church.
              </p>
            </div>
            {!showForm && (
              <button
                type="button"
                onClick={() => {
                  setShowForm(true);
                  setMessage(null);
                }}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#b36b3c] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#96552e]"
              >
                + Submit Partnership Request
              </button>
            )}
          </div>

          {message && (
            <div className={`mt-6 rounded-xl p-4 text-sm ${message.type === "success" ? "bg-[#eef2ed] text-[#26352f]" : "bg-red-50 text-red-700"}`}>
              {message.text}
            </div>
          )}

          {showForm ? (
            <form onSubmit={submitRequest} className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#dfdbd1] sm:p-7">
              <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4 mb-6">
                <h2 className="text-xl font-semibold text-[#26352f]">Partnership Proposal Form</h2>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sm font-semibold text-[#b36b3c] hover:underline"
                >
                  &larr; Back to Proposals
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium sm:col-span-2">Organization or group<input required maxLength={160} value={organization} onChange={(event) => setOrganization(event.target.value)} className={inputClass} placeholder="Organization name" /></label>
                <label className="block text-sm font-medium">Contact person<input required maxLength={160} value={contactName} onChange={(event) => setContactName(event.target.value)} className={inputClass} placeholder="Full name" /></label>
                <label className="block text-sm font-medium">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="you@example.com" /></label>
                <label className="block text-sm font-medium">Phone number (optional)<input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} minLength={10} value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 10))} className={inputClass} placeholder="07XXXXXXXX (optional)" /></label>
                <label className="block text-sm font-medium">Partnership area<select value={partnershipType} onChange={(event) => setPartnershipType(event.target.value)} className={inputClass}><option value="community_outreach">Community outreach</option><option value="ministry">Ministry collaboration</option><option value="sponsorship">Sponsorship or funding</option><option value="services">Services or resources</option><option value="other">Other</option></select></label>
                <label className="block text-sm font-medium sm:col-span-2">Partnership proposal<textarea required minLength={5} rows={6} value={proposal} onChange={(event) => setProposal(event.target.value)} className={inputClass} placeholder="Describe your idea, goals, and how you would like to work together." /></label>
              </div>
              <div className="flex items-center gap-3 mt-6">
                <button disabled={loading} className="flex-1 rounded-full bg-[#b36b3c] px-5 py-3 font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60">
                  {loading ? "Submitting..." : "Submit Partnership Request"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="rounded-full border border-[#c9c5bb] px-6 py-3 font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <section className="mt-6">
              {fetchingList ? (
                <div className="rounded-3xl border border-[#dfdbd1] bg-white p-8 text-center text-sm text-[#617068]">
                  Loading partnership requests...
                </div>
              ) : partnerships.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[#c9c5bb] bg-white p-8 sm:p-12 text-center">
                  <span className="text-4xl" aria-hidden="true">🌱</span>
                  <h3 className="mt-3 text-lg font-semibold text-[#26352f]">No partnership requests submitted yet</h3>
                  <p className="mt-1 text-sm text-[#617068]">Tell us how your organization or business would like to partner with Loma Linda SDA Church.</p>
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="mt-5 rounded-full bg-[#b36b3c] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#96552e]"
                  >
                    + Submit Partnership Request
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {partnerships.map((item) => (
                    <div key={item.id} className="flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-xs text-[#617068]">
                          <span className="font-semibold text-[#26352f]">{item.name || "Partnership Proposal"}</span>
                          <span className="capitalize rounded-full bg-[#eef2ed] px-2.5 py-1 text-[11px] font-semibold text-[#5f8067]">
                            {item.category?.replace("_", " ") || "Partner"}
                          </span>
                        </div>
                        {item.content && (
                          <p className="mt-2 text-xs leading-relaxed text-[#26352f] whitespace-pre-line">
                            {item.content}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-[#617068] pt-2 border-t border-[#dfdbd1]">
                        <span>Status: <strong className="capitalize text-[#b36b3c]">{item.status || "Under Review"}</strong></span>
                        {item.created_at && <span>{new Date(item.created_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          </div>
        </div>
      </div>
    </main>
  );
}
