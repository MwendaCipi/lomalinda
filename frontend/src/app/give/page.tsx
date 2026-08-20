"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { showAlert } from "@/lib/alerts";
import { getMinistryGivingPurpose } from "@/config/ministries";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const defaultPurposes = [
  "General giving",
  "Tithe",
  "Church development",
  "Local Church Budget (LCB)",
  "Children Ministry",
  "Adventist Possibility Ministries (APM)",
  "Adventist Youth Ministries (AY)",
  "Adventist Men Ministries (AMM)",
  "Adventist Women Ministries (AWM)",
  "Personal Ministries",
  "Adventist Muslim Relations (AMR)",
  "Music & Choir Ministry",
  "Chaplaincy Ministry",
  "Msamaria Mwema",
  "Missions",
];

type GivingTab = "mpesa" | "card" | "in_kind";

function GivePageContent() {
  const searchParams = useSearchParams();
  const rawPurposeParam = searchParams.get("purpose");
  const rawTabParam = searchParams.get("tab");
  const normalizedPurpose = rawPurposeParam ? getMinistryGivingPurpose(rawPurposeParam) : "General giving";

  const initialTab: GivingTab =
    rawTabParam === "in_kind" || rawTabParam === "in-kind"
      ? "in_kind"
      : rawTabParam === "card"
      ? "card"
      : "mpesa";

  const [tab, setTab] = useState<GivingTab>(initialTab);
  const [amount, setAmount] = useState("1000");
  const [purpose, setPurpose] = useState(normalizedPurpose);
  const [purposes, setPurposes] = useState<string[]>(() => {
    if (normalizedPurpose && !defaultPurposes.includes(normalizedPurpose)) {
      return [normalizedPurpose, ...defaultPurposes];
    }
    return defaultPurposes;
  });
  const [phoneNumber, setPhoneNumber] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (rawPurposeParam) {
      const mapped = getMinistryGivingPurpose(rawPurposeParam);
      setPurpose(mapped);
      setPurposes((prev) => (prev.includes(mapped) ? prev : [mapped, ...prev]));
    }
  }, [rawPurposeParam]);

  useEffect(() => {
    if (rawTabParam) {
      if (rawTabParam === "in_kind" || rawTabParam === "in-kind") setTab("in_kind");
      else if (rawTabParam === "card") setTab("card");
      else if (rawTabParam === "mpesa") setTab("mpesa");
    }
  }, [rawTabParam]);

  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success") {
      showAlert("Payment Received", "Your card payment was received. Thank you for your faithful giving.", "success");
    } else if (paymentStatus === "cancelled") {
      showAlert("Payment Cancelled", "Card checkout was cancelled. You can try again or use M-Pesa.", "warning");
    }
  }, [searchParams]);

  useEffect(() => {
    fetch(`${API_URL}/api/members/giving-purposes/`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: { name: string }[]) => {
        if (data.length) {
          const apiNames = data.map((item) => item.name);
          setPurposes((prev) => {
            const combined = Array.from(new Set([purpose, ...apiNames, ...prev]));
            return combined;
          });
        }
      })
      .catch(() => undefined);
  }, [purpose]);

  async function submitGiving(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    try {
      const isFinancial = tab === "mpesa" || tab === "card";
      const payload: Record<string, unknown> = {
        giving_type: isFinancial ? "financial" : "in_kind",
        payment_method: tab === "card" ? "card" : "mpesa",
        amount: isFinancial ? amount : "0",
        purpose,
        phone_number: phoneNumber,
        item_description: itemDescription,
        donor_name: donorName,
        donor_email: donorEmail,
      };

      const response = await fetch(`${API_URL}/api/members/contributions/initiate/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || Object.values(data).flat().join(" ") || "We could not start the giving request.");
      }

      if (tab === "card" && data.checkout_url) {
        window.location.assign(data.checkout_url);
        return;
      }

      const successMsg =
        data.message ??
        (tab === "mpesa"
          ? "M-Pesa payment prompt sent to your phone. Enter PIN to complete your contribution."
          : tab === "card"
          ? "Thank you for giving."
          : "Thank you! Your in-kind contribution pledge has been recorded. Our welfare and deaconry team will connect with you.");

      setMessage(successMsg);
      showAlert(
        tab === "mpesa" ? "Payment Prompt Sent" : tab === "card" ? "Payment Received" : "Gift Pledge Received",
        successMsg,
        "success"
      );

      if (tab === "in_kind") {
        setItemDescription("");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to connect to the giving service.";
      setMessage(errorMsg);
      showAlert("Giving Error", errorMsg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pb-16 pt-10 text-[#26352f] lg:px-8 lg:pt-14">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Systematic benevolence and donations</h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-[#617068]">
              Support worship, ministry, prayer, and care for our church family through financial giving or practical in-kind gifts.
            </p>
          </div>

          <form onSubmit={submitGiving} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-7">
            <h2 className="text-2xl font-semibold">How would you like to give?</h2>

            {/* 3 Toggles: M-Pesa, Card, In-Kind */}
            <div className="mt-4 flex rounded-2xl bg-[#eef2ed] p-1 gap-1">
              <button
                type="button"
                onClick={() => setTab("mpesa")}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  tab === "mpesa" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"
                }`}
              >
                M-Pesa
              </button>
              <button
                type="button"
                onClick={() => setTab("card")}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  tab === "card" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"
                }`}
              >
                Card
              </button>
              <button
                type="button"
                onClick={() => setTab("in_kind")}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  tab === "in_kind" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"
                }`}
              >
                In-kind
              </button>
            </div>

            {/* Financial (M-Pesa or Card) fields */}
            {tab !== "in_kind" ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Amount (KES)
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Giving purpose
                  <select
                    required
                    value={purpose}
                    onChange={(event) => setPurpose(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 outline-none focus:border-[#b36b3c]"
                  >
                    {purposes.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              /* In-kind fields */
              <div className="mt-5 space-y-4">
                <label className="block text-sm font-medium">
                  Giving purpose / Department
                  <select
                    required
                    value={purpose}
                    onChange={(event) => setPurpose(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 outline-none focus:border-[#b36b3c]"
                  >
                    {purposes.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  What would you like to give?
                  <textarea
                    required
                    rows={3}
                    value={itemDescription}
                    onChange={(event) => setItemDescription(event.target.value)}
                    placeholder="For example: 10 Bibles, sound equipment, 20 bags of maize, construction materials..."
                    className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                  />
                </label>
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Phone number {tab === "mpesa" ? "(M-Pesa)" : ""}
                <input
                  required={tab === "mpesa"}
                  placeholder="e.g. 01XX XXX XXX or 07XX XXX XXX"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>

              <label className="block text-sm font-medium">
                Your name <span className="font-normal text-[#617068]">(optional)</span>
                <input
                  value={donorName}
                  onChange={(event) => setDonorName(event.target.value)}
                  placeholder="Full name"
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>

              <label className="block text-sm font-medium sm:col-span-2">
                Email {tab === "card" ? <span className="text-red-500">*</span> : <span className="font-normal text-[#617068]">(optional for receipt)</span>}
                <input
                  type="email"
                  required={tab === "card"}
                  placeholder={tab === "card" ? "Required for payment receipt" : "Share your email if you need a receipt"}
                  value={donorEmail}
                  onChange={(event) => setDonorEmail(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
            </div>

            <button
              disabled={loading}
              className="mt-5 w-full rounded-full bg-[#b36b3c] px-6 py-3.5 font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60"
            >
              {loading
                ? "Submitting..."
                : tab === "mpesa"
                ? "Continue with M-Pesa"
                : tab === "card"
                ? "Pay with Card"
                : "Submit In-Kind Gift"}
            </button>
            {message && <p className="mt-4 rounded-xl bg-[#eef2ed] p-4 text-sm text-[#3d5148]">{message}</p>}
          </form>
        </div>
      </div>
    </main>
  );
}

export default function GivePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">
          Loading giving options...
        </main>
      }
    >
      <GivePageContent />
    </Suspense>
  );
}
