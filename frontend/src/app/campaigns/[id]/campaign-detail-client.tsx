"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Campaign {
  id: number;
  name: string;
  title: string;
  description: string;
  target_amount: number;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  generate_card: boolean;
  custom_card_image?: string | null;
  total_raised: number;
  percentage_raised: number;
  donor_count: number;
}

export default function CampaignDetailClient() {
  const params = useParams();
  const campaignId = params?.id;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Payment form states
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "paybill" | "card">("mpesa");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (!campaignId) return;
    fetch(`${API_URL}/api/members/campaigns/${campaignId}/`)
      .then((res) => {
        if (!res.ok) throw new Error("Campaign not found.");
        return res.json();
      })
      .then((data) => setCampaign(data))
      .catch((err) => setError(err.message || "Failed to load campaign details."))
      .finally(() => setLoading(false));
  }, [campaignId]);

  async function handleDonate(e: FormEvent) {
    e.preventDefault();
    if (!campaign) return;
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      showAlert("Invalid amount", "Please enter a valid amount.", "error");
      return;
    }

    if (paymentMethod === "mpesa" && !phoneNumber.trim()) {
      showAlert("Phone number required", "Please enter your M-Pesa phone number.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/members/contributions/initiate/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numericAmount,
          giving_type: "financial",
          purpose: campaign.name,
          phone_number: phoneNumber,
          donor_name: donorName,
          donor_email: donorEmail,
          payment_method: paymentMethod === "card" ? "card" : "mpesa",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || Object.values(data).flat().join(" ") || "Failed to initiate payment.");

      if (paymentMethod === "card" && data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        showAlert("M-Pesa Prompt Sent", "Check your phone for the M-Pesa PIN prompt to complete your contribution.", "success");
        setAmount("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment error";
      showAlert("Payment Error", msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleShareWhatsApp() {
    if (!campaign) return;
    const shareUrl = window.location.href;
    const text = `*Loma Linda SDA Church Fundraising Card*\n\nJoin us in supporting *${campaign.title || campaign.name}*!\n\nTarget Goal: KES ${Number(campaign.target_amount).toLocaleString()}\nRaised so far: KES ${Number(campaign.total_raised).toLocaleString()} (${campaign.percentage_raised}%)\n\nGive online or via M-Pesa here:\n${shareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-[#26352f]">
        <div className="mx-auto max-w-md text-center">
          <p className="text-sm font-medium text-[#617068]">Loading campaign details...</p>
        </div>
      </main>
    );
  }

  if (error || !campaign) {
    return (
      <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-[#26352f]">
        <div className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-[#dfdbd1]">
          <h1 className="text-2xl font-semibold">Campaign Not Found</h1>
          <p className="mt-2 text-sm text-[#617068]">{error || "The requested campaign could not be found."}</p>
          <Link href="/support" className="mt-6 inline-block rounded-full bg-[#5f8067] px-6 py-2.5 font-medium text-white">
            Return to Stewardship
          </Link>
        </div>
      </main>
    );
  }

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`;

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-4 py-8 text-[#26352f] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/support" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] hover:underline">
            <span>&larr;</span>
            <span>Back to Stewardship</span>
          </Link>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${campaign.is_active ? "bg-[#e8f3ec] text-[#2d5d39]" : "bg-[#f3e8e8] text-[#8c2e2e]"}`}>
            {campaign.is_active ? "Active Campaign" : "Campaign Ended"}
          </span>
        </div>

        {/* Campaign Visual Card Container */}
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#dfdbd1]">
          {campaign.custom_card_image ? (
            <div className="relative w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={campaign.custom_card_image} alt={campaign.title || campaign.name} className="max-h-96 w-full object-cover" />
              <div className="bg-[#26352f] p-6 text-white sm:p-8">
                <h1 className="text-2xl font-bold sm:text-3xl">{campaign.title || campaign.name}</h1>
                {campaign.description && <p className="mt-2 text-sm leading-relaxed text-[#d1d8d4]">{campaign.description}</p>}
              </div>
            </div>
          ) : (
            /* Auto-Generated Digital Card */
            <div className="relative overflow-hidden bg-gradient-to-br from-[#1d2a25] via-[#26352f] to-[#3a4d44] p-6 text-white sm:p-8">
              {/* Subtle Decorative Pattern Background */}
              <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-[#5f8067]/20 blur-3xl" />
              <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
                <div className="space-y-3 sm:max-w-xl">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-[#e4b568] backdrop-blur-md">
                    <span>🏛️ Loma Linda SDA Church</span>
                    <span>•</span>
                    <span>Fundraising Card</span>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-white sm:text-4xl">{campaign.title || campaign.name}</h1>
                  {campaign.description && <p className="text-sm leading-relaxed text-[#d1d8d4]">{campaign.description}</p>}
                  
                  <div className="flex flex-wrap items-center gap-4 text-xs text-[#a3b8ac] pt-2">
                    <div><span className="font-semibold text-white">M-Pesa Acc Name:</span> <code className="rounded bg-white/10 px-2 py-1 text-[#e4b568] font-mono font-bold">{campaign.name}</code></div>
                    <div><span className="font-semibold text-white">Started:</span> {campaign.start_date}</div>
                    {campaign.end_date && <div><span className="font-semibold text-white">Ends:</span> {campaign.end_date}</div>}
                  </div>
                </div>

                {/* QR Code Container */}
                <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-white p-3 shadow-md sm:p-4 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCodeUrl} alt="Scan to Give QR Code" className="h-32 w-32 rounded-lg" />
                  <span className="mt-2 text-[10px] font-semibold text-[#26352f]">Scan to Give Online</span>
                </div>
              </div>
            </div>
          )}

          {/* Live Progress Bar Section */}
          <div className="border-t border-[#dfdbd1] bg-[#faf9f5] p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#617068]">Fundraising Progress</span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[#26352f] sm:text-3xl">KES {Number(campaign.total_raised).toLocaleString()}</span>
                  <span className="text-sm text-[#617068]">raised of KES {Number(campaign.target_amount).toLocaleString()} goal</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white px-4 py-2 text-center ring-1 ring-[#dfdbd1]">
                  <span className="block text-xs text-[#617068]">Percentage</span>
                  <span className="text-lg font-bold text-[#5f8067]">{campaign.percentage_raised}%</span>
                </div>
                <div className="rounded-2xl bg-white px-4 py-2 text-center ring-1 ring-[#dfdbd1]">
                  <span className="block text-xs text-[#617068]">Donors</span>
                  <span className="text-lg font-bold text-[#9a741c]">{campaign.donor_count}</span>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-[#e6e2d8]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#9a741c] via-[#5f8067] to-[#2d5d39] transition-all duration-700"
                style={{ width: `${Math.min(100, campaign.percentage_raised)}%` }}
              />
            </div>

            {/* Share Action Buttons */}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#20bd5a]"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                </svg>
                <span>Share via WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-2 rounded-full border border-[#dfdbd1] bg-white px-5 py-2.5 text-sm font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]"
              >
                <span>{copySuccess ? "✓ Link Copied!" : "📋 Copy Share Link"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Giving Widget Section */}
        {campaign.is_active && (
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
            <h2 className="text-xl font-bold tracking-tight text-[#26352f]">Support this Campaign</h2>
            <p className="mt-1 text-sm text-[#617068]">Select your preferred contribution method to help us reach our target.</p>

            {/* Payment Method Switcher Tabs */}
            <div className="mt-5 flex flex-wrap rounded-2xl border border-[#dfdbd1] p-1 gap-1">
              <button
                type="button"
                onClick={() => setPaymentMethod("mpesa")}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${paymentMethod === "mpesa" ? "bg-[#5f8067] text-white shadow-sm" : "text-[#617068] hover:bg-[#f7f4ee]"}`}
              >
                M-Pesa Express (STK Push)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("paybill")}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${paymentMethod === "paybill" ? "bg-[#5f8067] text-white shadow-sm" : "text-[#617068] hover:bg-[#f7f4ee]"}`}
              >
                Manual M-Pesa Paybill
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("card")}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${paymentMethod === "card" ? "bg-[#5f8067] text-white shadow-sm" : "text-[#617068] hover:bg-[#f7f4ee]"}`}
              >
                Card Payment
              </button>
            </div>

            {paymentMethod === "paybill" ? (
              <div className="mt-6 space-y-4 rounded-2xl bg-[#faf9f5] p-5 ring-1 ring-[#dfdbd1]">
                <h3 className="font-semibold text-[#26352f]">How to give via M-Pesa Paybill:</h3>
                <ol className="list-decimal space-y-2.5 pl-5 text-sm text-[#4a5851]">
                  <li>Go to <strong>M-Pesa menu</strong> on your phone and select <strong>Lipa na M-Pesa</strong> &rarr; <strong>Paybill</strong>.</li>
                  <li>Enter Business Number: <code className="rounded bg-white px-2 py-0.5 font-bold text-[#b36b3c] ring-1 ring-[#dfdbd1]">247247</code> (Loma Linda SDA Church).</li>
                  <li>
                    Enter Account Number: <code className="rounded bg-white px-2 py-0.5 font-bold text-[#b36b3c] ring-1 ring-[#dfdbd1]">{campaign.name}</code>
                  </li>
                  <li>Enter your contribution amount and your M-Pesa PIN to complete.</li>
                </ol>
              </div>
            ) : (
              <form onSubmit={handleDonate} className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-[#26352f]">
                    Contribution Amount (KES) *
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 1000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                    />
                  </label>

                  {paymentMethod === "mpesa" && (
                    <label className="block text-sm font-medium text-[#26352f]">
                      M-Pesa Phone Number *
                      <input
                        type="tel"
                        required
                        placeholder="e.g. 0712345678"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                      />
                    </label>
                  )}

                  <label className="block text-sm font-medium text-[#26352f]">
                    Your Name (Optional)
                    <input
                      type="text"
                      placeholder="e.g. Jane Doe"
                      value={donorName}
                      onChange={(e) => setDonorName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                    />
                  </label>

                  <label className="block text-sm font-medium text-[#26352f]">
                    Your Email (Optional for receipt)
                    <input
                      type="email"
                      placeholder="e.g. jane@example.com"
                      value={donorEmail}
                      onChange={(e) => setDonorEmail(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                    />
                  </label>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#5f8067] px-8 font-medium text-white transition hover:bg-[#4d6d55] disabled:opacity-60"
                  >
                    {isSubmitting ? "Processing..." : paymentMethod === "card" ? "Proceed to Card Checkout" : "Send M-Pesa Prompt"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
