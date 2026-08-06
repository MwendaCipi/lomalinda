"use client";

import Link from "next/link";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const IN_KIND_CATEGORIES = [
  { value: "Tithes", label: "Tithes (e.g. Produce/Harvest)" },
  { value: "Local Church Budget", label: "Local Church Budget" },
  { value: "Combined Offerings", label: "Combined Offerings" },
  { value: "Camp Meeting Expenses", label: "Camp Meeting Expenses" },
  { value: "Camp Meeting Offering", label: "Camp Meeting Offering" },
  { value: "Church Building Project", label: "Church Building Project" },
];

export default function GiveInKindPage() {
  const [category, setCategory]           = useState("Tithes");
  const [donorName, setDonorName]         = useState("");
  const [phoneNumber, setPhoneNumber]     = useState("");
  const [donorEmail, setDonorEmail]       = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [message, setMessage]             = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const selectedCat = IN_KIND_CATEGORIES.find((c) => c.value === category);

    try {
      const res = await fetch(`${API_URL}/api/members/contributions/initiate/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giving_type: "in_kind",
          amount: 0,
          purpose: `In-kind pledge – ${selectedCat?.value ?? category}`,
          phone_number: phoneNumber,
          donor_name: donorName,
          donor_email: donorEmail,
          item_description: itemDescription,
          category,
        }),
      });

      if (res.ok) {
        setMessage({
          type: "success",
          text: "Thank you! Your in-kind contribution pledge has been recorded. Our welfare & deaconry team will contact you shortly.",
        });
        setItemDescription("");
        setDonorName("");
        setPhoneNumber("");
        setDonorEmail("");
        setCategory("Tithes");
      } else {
        const data = await res.json();
        setMessage({
          type: "error",
          text: data.detail || "Unable to submit in-kind contribution. Check form input.",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-10 pb-16 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Back Button */}
        <Link
          href="/support"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Stewardship &amp; Support</span>
        </Link>

        <div className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">In-Kind Giving</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Physical &amp; Service Contributions</h1>
        </div>

        {/* Category grid — visual picker */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {IN_KIND_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                category === cat.value
                  ? "border-[#b36b3c] bg-[#b36b3c] text-white shadow-sm"
                  : "border-[#dfdbd1] bg-white text-[#26352f] hover:border-[#b36b3c]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Form Card */}
        <div className="mt-6 rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-10">
          {message && (
            <div
              className={`mb-6 rounded-2xl p-4 text-sm font-medium ${
                message.type === "success" ? "bg-[#eef2ed] text-[#26352f]" : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-[#26352f]">
                Describe Your Contribution / Item
              </label>
              <textarea
                required
                rows={4}
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder="e.g. 5 bags of cement for church building, PA system equipment, catering supplies, or legal/accounting services..."
                className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Your Name</label>
                <input
                  type="text"
                  required
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  placeholder="Full name"
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Contact phone number"
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#26352f]">
                Email Address (Optional)
              </label>
              <input
                type="email"
                value={donorEmail}
                onChange={(e) => setDonorEmail(e.target.value)}
                placeholder="Email address for confirmation"
                className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[#b36b3c] py-4 text-center font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit In-Kind Pledge"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
