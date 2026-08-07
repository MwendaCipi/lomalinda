"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function FinancialGivingPage() {
  const [purposes, setPurposes] = useState<string[]>(["Tithes", "Local Church Budget", "Combined Offerings", "Camp Meeting Expenses", "Camp Meeting Offering", "Church Building Project"]);
  const [selectedPurpose, setSelectedPurpose] = useState("Tithes");
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "card">("mpesa");
  const [amount, setAmount] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/members/giving-purposes/`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { name: string }[]) => {
        if (data.length > 0) {
          const names = data.map((p) => p.name);
          setPurposes(names);
          setSelectedPurpose(names[0]);
        }
      })
      .catch(() => {});

    const paymentStatus = new URLSearchParams(window.location.search).get("payment");
    if (paymentStatus === "success") setMessage({ type: "success", text: "Your card payment was received. Thank you for giving." });
    if (paymentStatus === "cancelled") setMessage({ type: "error", text: "Card checkout was cancelled. You can try again or use M-Pesa." });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_URL}/api/members/contributions/initiate/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giving_type: "financial",
          payment_method: paymentMethod,
          amount: parseFloat(amount),
          purpose: selectedPurpose,
          phone_number: phoneNumber,
          donor_name: donorName,
          donor_email: donorEmail,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (paymentMethod === "card" && data.checkout_url) {
          window.location.assign(data.checkout_url);
          return;
        }
        setMessage({ type: "success", text: "M-Pesa prompt sent to your phone. Complete payment to record your gift." });
        setAmount("");
        setPhoneNumber("");
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.detail || "Unable to initiate payment. Check phone number format." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-6 pb-16 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Back Button */}
        <Link
          href="/support"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Stewardship & Support</span>
        </Link>

        <div className="mt-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Financial Giving</h1>
        </div>

        {/* Giving Form Card */}
        <div className="mx-auto mt-4 max-w-2xl rounded-3xl border border-[#dfdbd1] bg-white p-6 shadow-sm sm:p-8">
          {message && (
            <div
              className={`mb-6 rounded-2xl p-4 text-sm font-medium ${
                message.type === "success" ? "bg-[#eef2ed] text-[#26352f]" : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#26352f]">Payment method</label>
              <div className="mt-2 flex rounded-2xl bg-[#eef2ed] p-1">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("mpesa")}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${paymentMethod === "mpesa" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"}`}
                >
                  M-Pesa
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${paymentMethod === "card" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"}`}
                >
                  Card
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#26352f]">Giving Purpose</label>
              <select
                value={selectedPurpose}
                onChange={(e) => setSelectedPurpose(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
              >
                {purposes.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Amount (KES)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 1000"
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#26352f]">{paymentMethod === "mpesa" ? "M-Pesa Phone Number" : "Phone Number"}</label>
                <input
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="07XX XXX XXX or 2547XX..."
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Your Name (Optional)</label>
                <input
                  type="text"
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  placeholder="Full name"
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Email Address {paymentMethod === "card" ? "(Required)" : "(Optional)"}</label>
                <input
                  type="email"
                  required={paymentMethod === "card"}
                  value={donorEmail}
                  onChange={(e) => setDonorEmail(e.target.value)}
                  placeholder="For electronic receipt"
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-[#5f8067] py-3.5 text-center font-semibold text-white transition hover:bg-[#4d6d55] disabled:opacity-50 sm:col-start-2"
              >
                {submitting ? "Processing..." : "Give"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
