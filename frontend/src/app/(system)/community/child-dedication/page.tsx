"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { RequestsSidebar } from "@/components/sidebars/requests-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type DedicationRecord = {
  id: number;
  name?: string;
  child_name?: string;
  child_dob?: string;
  father_name?: string;
  mother_name?: string;
  phone_number?: string;
  notes?: string;
  created_at?: string;
  status?: string;
};

export default function ChildDedicationPage() {
  const [dedications, setDedications] = useState<DedicationRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fetchingList, setFetchingList] = useState(true);

  const [form, setForm] = useState({
    child_first_name: "",
    child_last_name: "",
    child_dob: "",
    father_name: "",
    mother_name: "",
    phone_number: "",
    notes: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const fetchDedications = async () => {
    setFetchingList(true);
    const storedToken = localStorage.getItem("access_token");
    const headers: Record<string, string> = {};
    if (storedToken) headers.Authorization = `Bearer ${storedToken}`;

    try {
      const res = await fetch(`${API_URL}/api/members/support-submissions/?type=dedication`, { headers });
      if (res.ok) {
        const data = await res.json();
        setDedications(Array.isArray(data) ? data : []);
      } else {
        setDedications([]);
      }
    } catch {
      setDedications([]);
    } finally {
      setFetchingList(false);
    }
  };

  const handleLookup = async (query?: string) => {
    const storedToken = localStorage.getItem("access_token") || token;
    let url = `${API_URL}/api/members/lookup/`;
    if (query) {
      url += `?query=${encodeURIComponent(query)}`;
    } else if (!storedToken) {
      return;
    }
    const headers: Record<string, string> = {};
    if (storedToken) headers.Authorization = `Bearer ${storedToken}`;

    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          setForm((prev) => {
            const genderLower = (data.gender || data.sex || "").toLowerCase();
            const isFemale = genderLower.includes("female") || genderLower === "f";
            const isMale = genderLower.includes("male") || genderLower === "m";

            let father = prev.father_name;
            let mother = prev.mother_name;

            if (isFemale && !mother) {
              mother = data.name;
            } else if (isMale && !father) {
              father = data.name;
            } else if (!father && !mother) {
              father = data.name;
            }

            return {
              ...prev,
              phone_number: prev.phone_number || data.phone_number || "",
              father_name: father,
              mother_name: mother,
            };
          });
        }
      }
    } catch {
      // Ignore lookup errors silently
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem("access_token");
    setToken(storedToken);
    fetchDedications();
    if (storedToken) {
      handleLookup();
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const storedToken = localStorage.getItem("access_token") || token;
    setLoading(true);
    setMessage("");

    try {
      const fullName = `${form.child_first_name.trim()} ${form.child_last_name.trim()}`.trim();
      const cleanPhone = form.phone_number.replace(/\D/g, "");
      if (cleanPhone.length !== 10) {
        showAlert("Invalid Phone Number", "Please enter a valid 10-digit phone number (e.g., 0712345678).", "warning");
        setLoading(false);
        return;
      }
      const payload = {
        submission_type: "dedication",
        content: `Child: ${fullName} (DOB: ${form.child_dob})\nParents: Father ${form.father_name}, Mother ${form.mother_name}\nNotes: ${form.notes}`,
        name: `${form.father_name || form.mother_name || fullName}`,
        phone_number: cleanPhone,
      };

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (storedToken) headers.Authorization = `Bearer ${storedToken}`;

      const res = await fetch(`${API_URL}/api/members/support-submissions/`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const text = "Your child dedication request has been submitted successfully. Our pastoral team will be in touch.";
        setMessage(text);
        showAlert("Request Received", text, "success");
        setForm({
          child_first_name: "",
          child_last_name: "",
          child_dob: "",
          father_name: "",
          mother_name: "",
          phone_number: "",
          notes: "",
        });
        setShowForm(false);
        fetchDedications();
      } else {
        const err = await res.json().catch(() => ({}));
        const text = err.detail || "Unable to submit your child dedication request.";
        setMessage(text);
        showAlert("Submission Error", text, "error");
      }
    } catch {
      const text = "Network error. Please try again.";
      setMessage(text);
      showAlert("Network Error", text, "error");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]";

  return (
    <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <RequestsSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] bg-white p-5 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Child Dedication</h1>
              <p className="mt-1 text-sm text-[#617068]">
                Schedule a child dedication service during Sabbath worship with our pastoral team.
              </p>
            </div>
            {!showForm && (
              <button
                type="button"
                onClick={() => {
                  setShowForm(true);
                  setMessage("");
                }}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#b36b3c] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#96552e]"
              >
                + Request Child Dedication
              </button>
            )}
          </div>

          {message && <p className="mt-6 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{message}</p>}

          {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
              <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[#dfdbd1] bg-white p-6 shadow-2xl sm:p-8">
                <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4 mb-6">
                  <h2 className="text-xl font-semibold text-[#26352f]">Child Dedication Form</h2>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="rounded-lg p-1.5 text-[#617068] hover:bg-[#f7f4ee] hover:text-[#26352f] transition"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={submit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-medium">
                      Child&apos;s First Name
                      <input
                        required
                        placeholder="First name"
                        value={form.child_first_name}
                        onChange={(e) => setForm({ ...form, child_first_name: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Child&apos;s Last Name
                      <input
                        required
                        placeholder="Last name"
                        value={form.child_last_name}
                        onChange={(e) => setForm({ ...form, child_last_name: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Child&apos;s Date of Birth
                      <input
                        required
                        type="date"
                        value={form.child_dob}
                        onChange={(e) => setForm({ ...form, child_dob: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Phone Number
                      <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]{10}"
                        maxLength={10}
                        minLength={10}
                        required
                        placeholder="e.g. 0712345678"
                        value={form.phone_number}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, "").slice(0, 10);
                          setForm({ ...form, phone_number: clean });
                          if (clean.length === 10) handleLookup(clean);
                        }}
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Father&apos;s Full Name
                      <input
                        required
                        placeholder="Father's name"
                        value={form.father_name}
                        onChange={(e) => setForm({ ...form, father_name: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Mother&apos;s Full Name
                      <input
                        required
                        placeholder="Mother's name"
                        value={form.mother_name}
                        onChange={(e) => setForm({ ...form, mother_name: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-sm font-medium sm:col-span-2">
                      Additional Notes or Preferred Date (Optional)
                      <textarea
                        rows={3}
                        placeholder="Special requests or notes for the pastoral team..."
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      disabled={loading}
                      type="submit"
                      className="flex-1 rounded-full bg-[#b36b3c] py-3.5 text-center font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60"
                    >
                      {loading ? "Submitting..." : "Submit Dedication Request"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="rounded-full border border-[#c9c5bb] px-6 py-3.5 font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <section className="mt-6">
            {fetchingList ? (
              <div className="rounded-3xl border border-[#dfdbd1] bg-white p-8 text-center text-sm text-[#617068]">
                Loading child dedication requests...
              </div>
            ) : dedications.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#c9c5bb] bg-white p-8 sm:p-12 text-center">
                <span className="text-4xl" aria-hidden="true">
                  👶
                </span>
                <h3 className="mt-3 text-lg font-semibold text-[#26352f]">
                  No child dedication requests submitted yet
                </h3>
                <p className="mt-1 text-sm text-[#617068]">
                  Begin a conversation about dedicating your child during Sabbath worship.
                </p>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-5 rounded-full bg-[#b36b3c] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#96552e]"
                >
                  + Request Child Dedication
                </button>
              </div>
              ) : dedications.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[#c9c5bb] bg-white p-8 sm:p-12 text-center">
                  <span className="text-4xl" aria-hidden="true">
                    👶
                  </span>
                  <h3 className="mt-3 text-lg font-semibold text-[#26352f]">
                    No child dedication requests submitted yet
                  </h3>
                  <p className="mt-1 text-sm text-[#617068]">
                    Begin a conversation about dedicating your child during Sabbath worship.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="mt-5 rounded-full bg-[#b36b3c] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#96552e]"
                  >
                    + Request Child Dedication
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {dedications.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs text-[#617068]">
                          <span className="font-semibold text-[#26352f]">{item.child_name || item.name}</span>
                          <span className="capitalize rounded-full bg-[#eef2ed] px-2.5 py-1 text-[11px] font-semibold text-[#5f8067]">
                            Child Dedication
                          </span>
                        </div>
                        {item.phone_number && (
                          <p className="mt-2 text-xs text-[#617068]">📞 {item.phone_number}</p>
                        )}
                        {item.notes && (
                          <p className="mt-2 text-xs leading-relaxed text-[#26352f] italic">
                            &ldquo;{item.notes}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-[#617068] pt-2 border-t border-[#dfdbd1]">
                        <span>Status: <strong className="capitalize text-[#b36b3c]">{item.status || "Received"}</strong></span>
                        {item.created_at && <span>{new Date(item.created_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
