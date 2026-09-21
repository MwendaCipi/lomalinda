"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { PublicSectionNav } from "@/components/public-section-nav";
import { stewardshipLinks } from "@/config/site-sections";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface Campaign {
  id: number;
  name: string;
  title: string;
  account_name?: string;
  description: string;
  target_amount: number;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  is_temporary?: boolean;
  generate_card: boolean;
  custom_card_image?: string | null;
  total_raised: number;
  percentage_raised: number;
  donor_count: number;
  assigned_cards_count?: number;
  group_breakdown?: Record<string, number>;
  top_fundraisers?: { name: string; group: string; amount: number }[];
}

interface CardAssignment {
  id: number;
  member_name: string;
  group_name: string;
  referral_token: string;
  total_raised: number;
  contributors_count?: number;
  contributors_amount?: number;
  my_amount?: number;
  group_amount?: number;
}

export default function CampaignDetailClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const campaignId = params?.id;
  const refToken = searchParams?.get("ref");

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [cardAssignment, setCardAssignment] = useState<CardAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Payment form states
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "paybill">("mpesa");
  const [stkProvider] = useState<"mpesa">("mpesa");
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
        if (!res.ok) throw new Error("Fund drive not found.");
        return res.json();
      })
      .then((data) => setCampaign(data))
      .catch((err) => setError(err.message || "Failed to load fund drive details."))
      .finally(() => setLoading(false));

    if (refToken) {
      fetch(`${API_URL}/api/members/campaign-cards/lookup/${refToken}/`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setCardAssignment(data);
        })
        .catch(() => {});
    }

    // Autofill logged-in user profile details if available
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (token) {
      fetch(`${API_URL}/api/members/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((userData) => {
          if (userData) {
            const name = userData.full_name || userData.name || "";
            const phone = userData.phone_number || "";
            const email = userData.email || "";
            if (name) setDonorName(name);
            if (phone) setPhoneNumber(phone);
            if (email) setDonorEmail(email);
          }
        })
        .catch(() => {});
    }
  }, [campaignId, refToken]);

  async function handleDonate(e: FormEvent) {
    e.preventDefault();
    if (!campaign) return;
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      showAlert("Invalid amount", "Please enter a valid amount.", "error");
      return;
    }

    if (!donorName.trim()) {
      showAlert("Name Required", "Please enter your name.", "warning");
      return;
    }

    if (paymentMethod === "mpesa") {
      const cleanPhone = phoneNumber.replace(/\D/g, "");
      if (!cleanPhone) {
        showAlert("Phone number required", "Please enter your M-Pesa phone number.", "error");
        return;
      }
      if (cleanPhone.length !== 10) {
        showAlert("Invalid phone number", "Please enter a valid 10-digit phone number (e.g., 0712345678).", "error");
        return;
      }
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
          payment_method: "mpesa",
          referral_token: refToken || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || Object.values(data).flat().join(" ") || "Failed to initiate payment.");

      showAlert(`M-Pesa Prompt Sent`, `Check your phone for the M-Pesa PIN prompt to complete your contribution.`, "success");
      setAmount("");
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
    const memberGreeting = cardAssignment ? `\nFundraising link for *${cardAssignment.member_name}* (${cardAssignment.group_name})\n` : "";
    const text = `*SDA Loma Linda Fund Drive*${memberGreeting}\nJoin us in supporting *${campaign.title || campaign.name}*!\n\nTarget Goal: KES ${Number(campaign.target_amount).toLocaleString()}\nRaised so far: KES ${Number(campaign.total_raised).toLocaleString()} (${campaign.percentage_raised}%)\n\nGive online or via mobile money here:\n${shareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
        <div className="px-6 py-16 text-center">
          <p className="text-sm font-medium text-[#617068]">Loading fund drive details...</p>
        </div>
      </main>
    );
  }

  if (error || !campaign) {
    return (
      <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
        <div className="px-6 py-16">
            <div className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-[#dfdbd1]">
              <h1 className="text-2xl font-semibold">Fund Drive Not Found</h1>
              <p className="mt-2 text-sm text-[#617068]">{error || "The requested fund drive could not be found."}</p>
              <Link href="/support/campaigns" className="mt-6 inline-block rounded-full bg-[#5f8067] px-6 py-2.5 font-medium text-white">
                Return to Fund Drives
              </Link>
            </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <div className="px-6 py-10 lg:px-8 lg:py-12">
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="flex items-center justify-between">
              <Link
                href="/support/campaigns"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#617068] transition hover:text-[#b36b3c]"
              >
                <span>&larr;</span>
                <span>All Fund Drives</span>
              </Link>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${campaign.is_active ? "bg-[#e8f3ec] text-[#2d5d39]" : "bg-[#f3e8e8] text-[#8c2e2e]"}`}>
                {campaign.is_active ? "Active Fund Drive" : "Fund Drive Ended"}
              </span>
            </div>

            {/* Personalized Card Owner Banner */}
            {cardAssignment && (
              <div className="flex items-center justify-between rounded-2xl bg-[#e8f3ec] p-4 text-[#2d5d39] ring-1 ring-[#5f8067]/30">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🎴</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider">Personalized Fund Drive Link</p>
                    <p className="text-sm font-semibold">
                      Link issued to: <strong className="text-[#26352f]">{cardAssignment.member_name}</strong> ({cardAssignment.group_name})
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-[11px] text-[#4a7256]">Raised via this link</span>
                  <span className="text-sm font-bold">KES {Number(cardAssignment.total_raised).toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* 1. Support this Fund Drive (Giving Widget) - Comes First */}
            {campaign.is_active && (
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
                <h2 className="text-xl font-bold tracking-tight text-[#26352f]">Support {campaign.title || campaign.name}</h2>
                <p className="mt-1 text-sm text-[#617068]">
                  {cardAssignment
                    ? `Your contribution will be credited to ${cardAssignment.member_name}'s fundraising target.`
                    : "Select your preferred contribution method to help us reach our target."}
                </p>

                {/* Payment Method Switcher Tabs */}
                <div className="mt-5 flex rounded-2xl border border-[#dfdbd1] p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("mpesa")}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold transition ${paymentMethod === "mpesa" ? "bg-[#5f8067] text-white shadow-sm" : "text-[#617068] hover:bg-[#f7f4ee]"}`}
                  >
                    STK Push
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("paybill")}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold transition ${paymentMethod === "paybill" ? "bg-[#5f8067] text-white shadow-sm" : "text-[#617068] hover:bg-[#f7f4ee]"}`}
                  >
                    Paybill
                  </button>
                </div>

                {paymentMethod === "paybill" ? (
                  <div className="mt-6 space-y-4 rounded-2xl bg-[#faf9f5] p-5 ring-1 ring-[#dfdbd1]">
                    <h3 className="font-semibold text-[#26352f]">How to give manually via Paybill:</h3>
                    <ol className="list-decimal space-y-2.5 pl-5 text-sm text-[#4a5851]">
                      <li>Go to <strong>M-Pesa / Mobile Money menu</strong> on your phone and select <strong>Lipa na M-Pesa</strong> &rarr; <strong>Paybill</strong>.</li>
                      <li>Enter Business Number: <code className="rounded bg-white px-2 py-0.5 font-bold text-[#b36b3c] ring-1 ring-[#dfdbd1]">247247</code> (SDA Loma Linda).</li>
                      <li>
                        Enter Account Number: <code className="rounded bg-white px-2 py-0.5 font-bold text-[#b36b3c] ring-1 ring-[#dfdbd1]">{campaign.name}</code>
                      </li>
                      <li>Enter your contribution amount and your PIN to complete.</li>
                    </ol>
                  </div>
                ) : (
                  <form onSubmit={handleDonate} className="mt-6 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-[#26352f]">
                        Full Name *
                        <input
                          type="text"
                          required
                          placeholder="e.g. Jane Doe"
                          value={donorName}
                          onChange={(e) => setDonorName(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                        />
                      </label>

                      {paymentMethod === "mpesa" && (
                        <label className="block text-sm font-medium text-[#26352f]">
                          M-Pesa Phone Number *
                          <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]{10}"
                            maxLength={10}
                            minLength={10}
                            required
                            placeholder="e.g. 0712345678"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                            className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                          />
                        </label>
                      )}

                      <label className="block text-sm font-medium text-[#26352f]">
                        Contribution Amount (KES) *
                        <input
                          type="number"
                          required
                          min="1"
                          placeholder="e.g. 1000"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                        />
                      </label>

                      <label className="block text-sm font-medium text-[#26352f]">
                        Your Email (Optional)
                        <input
                          type="email"
                          placeholder="e.g. jane@example.com"
                          value={donorEmail}
                          onChange={(e) => setDonorEmail(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                        />
                      </label>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#5f8067] px-8 font-medium text-white transition hover:bg-[#4d6d55] disabled:opacity-60 text-sm"
                      >
                        {isSubmitting
                          ? "Processing..."
                          : "Send M-Pesa Prompt"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* 2. Fundraising Progress Section */}
            <div className="rounded-3xl bg-[#faf9f5] p-6 sm:p-8 ring-1 ring-[#dfdbd1]">
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

              {/* Share Action Buttons - WhatsApp and Copy Link on the same row on Mobile */}
              <div className="mt-6 flex flex-row gap-3">
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-[#20bd5a]"
                >
                  <svg className="h-4 w-4 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                  </svg>
                  <span className="truncate">WhatsApp Share</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-[#dfdbd1] bg-white px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]"
                >
                  <span className="truncate">{copySuccess ? "✓ Link Copied!" : "📋 Copy My Link"}</span>
                </button>
              </div>
            </div>

            {/* 3. Contribution Breakdown & Top Fundraisers Leaderboard */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1]">
                <h3 className="text-base font-bold text-[#26352f]">
                  {cardAssignment ? "My Contribution Breakdown" : "Contribution Breakdown"}
                </h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between border-b border-[#faf9f5] pb-2">
                    <span className="font-medium text-[#617068]">Contributors Invited</span>
                    <span className="font-bold text-[#26352f]">
                      {cardAssignment?.contributors_count ?? (cardAssignment ? 1 : campaign.donor_count)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[#faf9f5] pb-2">
                    <span className="font-medium text-[#617068]">Contributors Amount</span>
                    <span className="font-bold text-[#5f8067]">
                      KES {Number(cardAssignment?.contributors_amount ?? cardAssignment?.total_raised ?? campaign.total_raised).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[#faf9f5] pb-2">
                    <span className="font-medium text-[#617068]">My Amount</span>
                    <span className="font-bold text-[#9a741c]">
                      KES {Number(cardAssignment?.my_amount ?? (cardAssignment ? Math.round(cardAssignment.total_raised * 0.4) : 0)).toLocaleString()}
                    </span>
                  </div>
                  {cardAssignment?.group_name && (
                    <div className="flex items-center justify-between border-b border-[#faf9f5] pb-2">
                      <span className="font-medium text-[#617068]">{cardAssignment.group_name} Contribution</span>
                      <span className="font-bold text-[#2d5d39]">
                        KES {Number(cardAssignment?.group_amount ?? (campaign.group_breakdown?.[cardAssignment.group_name] || cardAssignment.total_raised)).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {campaign.group_breakdown &&
                    Object.entries(campaign.group_breakdown).map(([grp, amt]) => {
                      if (grp === cardAssignment?.group_name) return null;
                      return (
                        <div key={grp} className="flex items-center justify-between border-b border-[#faf9f5] pb-2">
                          <span className="font-medium text-[#617068]">{grp} Contribution</span>
                          <span className="font-bold text-[#5f8067]">KES {Number(amt).toLocaleString()}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {campaign.top_fundraisers && campaign.top_fundraisers.length > 0 && (
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1]">
                  <h3 className="text-base font-bold text-[#26352f]">Top Fundraisers</h3>
                  <div className="mt-4 space-y-3">
                    {campaign.top_fundraisers.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-sm border-b border-[#faf9f5] pb-2">
                        <div>
                          <span className="font-semibold text-[#26352f]">{i + 1}. {f.name}</span>
                          <span className="block text-[11px] text-[#617068]">{f.group}</span>
                        </div>
                        <span className="font-bold text-[#9a741c]">KES {Number(f.amount).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
      </div>

      {/* The old Stewardship & Support sidebar, now part of the page. */}
      <PublicSectionNav
        eyebrow="Stewardship & support"
        title="More ways to support the church"
        description="In-kind gifts, fund drives, the church budget and the treasury's published figures."
        links={stewardshipLinks}
        activeKey="campaigns"
        className="border-t border-[#dfdbd1] bg-white/60"
      />
    </main>
  );
}
