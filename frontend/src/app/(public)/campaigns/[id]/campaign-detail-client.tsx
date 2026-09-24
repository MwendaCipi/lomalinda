"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { PublicSectionNav } from "@/components/public-section-nav";
import { DonutChart } from "@/components/mini-charts";
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
  deficit?: number;
  assigned_cards_count?: number;
  group_breakdown?: Record<string, number>;
  top_fundraisers?: { name: string; group: string; amount: number }[];
  contribution_breakdown?: {
    my_amount: number;
    my_gifts: number;
    invitees_amount: number;
    invitees_gifts: number;
    invitee_names: string[];
    others_amount: number;
    total_raised: number;
  };
  ministry_breakdown?: { ministry: string; amount: number }[];
  donors?: { name: string; amount: number; gifts: number }[];
}

interface CardAssignment {
  id: number;
  member_name: string;
  group_name: string;
  referral_token: string;
  total_raised: number;
}

const fmtKES = (value: number) => `KES ${Number(value || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

const PIE_COLORS = ["#2d5d39", "#5f8067", "#9a741c", "#b36b3c", "#4d6d55"];
const MINISTRY_COLORS = ["#2d5d39", "#5f8067", "#9a741c", "#b36b3c", "#8a7a5c", "#4d6d55", "#96552c", "#617068"];

export default function CampaignDetailClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const campaignId = params?.id;
  const refToken = searchParams?.get("ref");

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [cardAssignment, setCardAssignment] = useState<CardAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // The support form lives in a modal now; the page itself reads as a report.
  const [showSupportModal, setShowSupportModal] = useState(false);

  // Support form states
  const [phoneNumber, setPhoneNumber] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showDonors, setShowDonors] = useState(false);

  // The personalised-link banner and my/invitees rows only mean something to a
  // signed-in viewer; the API scopes the breakdown to the caller.
  const isPersonal = Boolean(refToken);

  useEffect(() => {
    if (!campaignId) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    fetch(`${API_URL}/api/members/campaigns/${campaignId}/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
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

    if (token) {
      fetch(`${API_URL}/api/members/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((userData) => {
          if (userData) {
            setSignedIn(true);
            const phone = userData.phone_number || "";
            const email = userData.email || "";
            const name = [userData.first_name, userData.last_name].filter(Boolean).join(" ").trim();
            setAccountEmail(email);
            if (phone) setPhoneNumber(phone);
            if (email) setDonorEmail(email);
            if (name && !donorName) setDonorName(name);
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, refToken]);

  async function handleDonate(e: FormEvent) {
    e.preventDefault();
    if (!campaign) return;
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      showAlert("Invalid amount", "Please enter a valid amount.", "error");
      return;
    }

    const cleanPhone = phoneNumber.replace(/\D/g, "");
    if (!cleanPhone) {
      showAlert("Phone number required", "Please enter your M-Pesa phone number.", "error");
      return;
    }
    if (cleanPhone.length !== 10) {
      showAlert("Invalid phone number", "Please enter a valid 10-digit phone number (e.g., 0712345678).", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      // A signed-in member's typed email is a change to the account — saved
      // first so the receipt reads it. A visitor's typed address rides along
      // on the gift itself; it is never verified and never stored as one.
      const typedEmail = donorEmail.trim();
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (signedIn && token && typedEmail && typedEmail.toLowerCase() !== accountEmail.trim().toLowerCase()) {
        const saved = await fetch(`${API_URL}/api/members/me/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ email: typedEmail }),
        });
        if (!saved.ok) {
          const problem = await saved.json().catch(() => ({}));
          throw new Error(
            problem.email?.[0] || problem.detail || "That email address could not be saved to your account."
          );
        }
        setAccountEmail(typedEmail);
      }

      const res = await fetch(`${API_URL}/api/members/contributions/initiate/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numericAmount,
          giving_type: "financial",
          purpose: campaign.name,
          phone_number: phoneNumber,
          donor_name: donorName.trim(),
          donor_email: signedIn ? donorEmail : "",
          payment_method: "mpesa",
          referral_token: refToken || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || Object.values(data).flat().join(" ") || "Failed to initiate payment.");

      showAlert("M-Pesa Prompt Sent", "Check your phone for the M-Pesa PIN prompt to complete your contribution.", "success");
      setAmount("");
      setShowSupportModal(false);
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
    const memberGreeting = cardAssignment ? `\nFund drive link for *${cardAssignment.member_name}* (${cardAssignment.group_name})\n` : "";
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

  const breakdown = campaign.contribution_breakdown;
  const deficit = campaign.deficit ?? Math.max(0, Number(campaign.target_amount) - Number(campaign.total_raised));

  // Pie slices: me, my invitees, others — with the remainder to the target as
  // the neutral part of the ring.
  const pieItems = breakdown
    ? [
        { label: "My contribution", value: breakdown.my_amount, color: "#2d5d39" },
        { label: "My invitees", value: breakdown.invitees_amount, color: "#9a741c" },
        { label: "Others", value: breakdown.others_amount, color: "#5f8067" },
      ]
    : [];

  const ministries = (campaign.ministry_breakdown ?? []).filter((m) => m.amount > 0);
  const maxMinistry = Math.max(0, ...ministries.map((m) => m.amount));

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <div className="px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
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

          {/* Personalised link banner */}
          {cardAssignment && (
            <div className="flex items-center justify-between rounded-2xl bg-[#e8f3ec] p-4 text-[#2d5d39] ring-1 ring-[#5f8067]/30">
              <div className="flex items-center gap-3">
                <span className="text-xl">🎴</span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">Personal Invite Link</p>
                  <p className="text-sm font-semibold">
                    Issued to: <strong className="text-[#26352f]">{cardAssignment.member_name}</strong> ({cardAssignment.group_name})
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="block text-[11px] text-[#4a7256]">Raised via this link</span>
                <span className="text-sm font-bold">KES {Number(cardAssignment.total_raised).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* 1. The drive itself */}
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
            <h1 className="text-xl font-bold tracking-tight text-[#26352f] sm:text-2xl">{campaign.title || campaign.name}</h1>
            {campaign.description ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#4a5851]">{campaign.description}</p>
            ) : (
              <p className="mt-3 text-sm italic text-[#617068]">The office has not written a description for this drive yet.</p>
            )}
            {campaign.account_name && (
              <p className="mt-3 text-xs text-[#617068]">
                Account reference: <code className="rounded-md bg-[#f7f4ee] px-2 py-0.5 font-mono font-bold text-[#b36b3c] ring-1 ring-[#dfdbd1]">{campaign.account_name}</code>
              </p>
            )}

            {campaign.is_active && (
              <button
                type="button"
                onClick={() => setShowSupportModal(true)}
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#5f8067] px-8 text-sm font-medium text-white transition hover:bg-[#4d6d55] sm:w-auto"
              >
                Support this Drive
              </button>
            )}
          </div>

          {/* 2. Fund drive progress */}
          <div className="rounded-3xl bg-[#faf9f5] p-6 sm:p-8 ring-1 ring-[#dfdbd1]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#617068]">Fund Drive Progress</span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[#26352f] sm:text-3xl">{fmtKES(campaign.total_raised)}</span>
                  <span className="text-sm text-[#617068]">raised of {fmtKES(campaign.target_amount)} goal</span>
                </div>
                {deficit > 0 && (
                  <p className="mt-1 text-sm font-semibold text-[#b36b3c]">
                    Deficit: {fmtKES(deficit)} <span className="font-normal text-[#617068]">still needed</span>
                  </p>
                )}
              </div>
              {/* Percent and donors split the width equally on a phone. */}
              <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setShowDonors((open) => !open)}
                  className="rounded-2xl bg-white px-4 py-2 text-center ring-1 ring-[#dfdbd1] transition hover:ring-[#b36b3c]"
                >
                  <span className="block text-xs text-[#617068]">Percentage</span>
                  <span className="text-lg font-bold text-[#5f8067]">{campaign.percentage_raised}%</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDonors((open) => !open)}
                  className="rounded-2xl bg-white px-4 py-2 text-center ring-1 ring-[#dfdbd1] transition hover:ring-[#b36b3c]"
                >
                  <span className="block text-xs text-[#617068]">Donors</span>
                  <span className="text-lg font-bold text-[#9a741c]">{campaign.donor_count}</span>
                </button>
              </div>
            </div>

            <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-[#e6e2d8]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#9a741c] via-[#5f8067] to-[#2d5d39] transition-all duration-700"
                style={{ width: `${Math.min(100, campaign.percentage_raised)}%` }}
              />
            </div>

            {/* Donor list, revealed by the donor badge. */}
            {showDonors && (
              <div className="mt-5 rounded-2xl border border-[#dfdbd1] bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#26352f]">Donors</h3>
                  <button type="button" onClick={() => setShowDonors(false)} className="text-xs font-semibold text-[#617068] hover:text-[#b36b3c]">
                    Hide
                  </button>
                </div>
                {(campaign.donors ?? []).length === 0 ? (
                  <p className="mt-3 text-xs text-[#617068]">No completed gifts yet — be the first to give.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-[#f2efe8]">
                    {(campaign.donors ?? []).map((d, i) => (
                      <li key={i} className="flex items-center justify-between py-2 text-sm">
                        <span className="min-w-0 truncate font-medium text-[#26352f]">{d.name}</span>
                        <span className="ml-3 shrink-0 text-right">
                          <span className="font-bold text-[#9a741c]">{fmtKES(d.amount)}</span>
                          <span className="ml-2 text-[11px] text-[#617068]">
                            {d.gifts} gift{d.gifts === 1 ? "" : "s"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Share actions */}
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
                <span className="truncate">{copySuccess ? "✓ Link Copied!" : "📋 Copy Link"}</span>
              </button>
            </div>
          </div>

          {/* 3. Contribution breakdown */}
          <div className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1]">
              <h3 className="text-base font-bold text-[#26352f]">
                {signedIn ? "My Contribution Breakdown" : "Contribution Breakdown"}
              </h3>

              {breakdown && signedIn ? (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-[#faf9f5] p-3 ring-1 ring-[#dfdbd1]">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#617068]">My contribution</span>
                      <span className="mt-0.5 block text-base font-bold text-[#2d5d39]">{fmtKES(breakdown.my_amount)}</span>
                      <span className="text-[11px] text-[#617068]">{breakdown.my_gifts} gift{breakdown.my_gifts === 1 ? "" : "s"}</span>
                    </div>
                    <div className="rounded-2xl bg-[#faf9f5] p-3 ring-1 ring-[#dfdbd1]">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#617068]">My invitees</span>
                      <span className="mt-0.5 block text-base font-bold text-[#9a741c]">{fmtKES(breakdown.invitees_amount)}</span>
                      <span className="text-[11px] text-[#617068]">
                        {breakdown.invitees_gifts} gift{breakdown.invitees_gifts === 1 ? "" : "s"}
                        {breakdown.invitee_names.length > 0 && ` · ${breakdown.invitee_names.join(", ")}`}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-[#faf9f5] p-3 ring-1 ring-[#dfdbd1]">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#617068]">Others</span>
                      <span className="mt-0.5 block text-base font-bold text-[#5f8067]">{fmtKES(breakdown.others_amount)}</span>
                    </div>
                    <div className="rounded-2xl bg-[#faf9f5] p-3 ring-1 ring-[#dfdbd1]">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#617068]">Total raised</span>
                      <span className="mt-0.5 block text-base font-bold text-[#26352f]">{fmtKES(breakdown.total_raised)}</span>
                    </div>
                  </div>

                  {/* Pie: me / invitees / others, remainder neutral. */}
                  <div className="mt-6">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#617068]">Share of the drive</p>
                    <div className="mt-3">
                      <DonutChart
                        items={pieItems}
                        centerLabel="of goal"
                        centerValue={`${campaign.percentage_raised}%`}
                        emptyLabel="No completed gifts to chart yet."
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-4 rounded-xl bg-[#faf9f5] px-4 py-6 text-center text-xs text-[#617068]">
                  {signedIn
                    ? "No gifts recorded yet on this drive."
                    : "Sign in to see your own contribution and invitees in this breakdown."}
                </p>
              )}
            </div>

            {/* Ministry columns */}
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1]">
              <h3 className="text-base font-bold text-[#26352f]">Giving by Ministry</h3>
              {ministries.length === 0 ? (
                <p className="mt-4 rounded-xl bg-[#faf9f5] px-4 py-6 text-center text-xs text-[#617068]">
                  No completed gifts to chart yet.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {ministries.map((m, i) => (
                    <li key={m.ministry}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-xs font-semibold text-[#26352f]">{m.ministry}</span>
                        <span className="shrink-0 text-xs font-bold text-[#26352f]">{fmtKES(m.amount)}</span>
                      </div>
                      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-[#f2efe8]" role="img" aria-label={`${m.ministry}: ${fmtKES(m.amount)}`}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(2, (m.amount / maxMinistry) * 100)}%`, backgroundColor: MINISTRY_COLORS[i % MINISTRY_COLORS.length] }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Ministry-group leaderboard, kept for drives issued by group. */}
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
                      <span className="font-bold text-[#9a741c]">{fmtKES(f.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Support modal ── */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-modal-title"
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-[#dfdbd1]"
          >
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <h3 id="support-modal-title" className="text-lg font-bold text-[#26352f]">
                Support {campaign.title || campaign.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowSupportModal(false)}
                className="rounded-full p-1.5 text-[#617068] transition hover:bg-[#f7f4ee] hover:text-[#26352f]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {cardAssignment && (
              <p className="mt-3 rounded-xl bg-[#e8f3ec] px-3 py-2 text-xs text-[#2d5d39]">
                Credited to {cardAssignment.member_name}&apos;s invite ({cardAssignment.group_name}).
              </p>
            )}

            <form onSubmit={handleDonate} className="mt-4 space-y-4">
              {/* Name: typed freely; signed-in givers arrive pre-filled. No
                  email is collected from visitors — receipts go by SMS. */}
              <label className="block text-sm font-medium text-[#26352f]">
                Name
                <input
                  type="text"
                  placeholder="Your name"
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                />
              </label>

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

              {signedIn ? (
                <label className="block text-sm font-medium text-[#26352f]">
                  Email <span className="font-normal text-[#617068]">(optional — for your receipt)</span>
                  <input
                    type="email"
                    value={donorEmail}
                    onChange={(e) => setDonorEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </label>
              ) : (
                <p className="text-[11px] leading-relaxed text-[#617068]">
                  Your receipt is sent by SMS.{" "}
                  <Link href={`/login?next=/campaigns/${campaignId}`} className="font-semibold text-[#b36b3c] hover:underline">
                    Sign in
                  </Link>{" "}
                  to get it by email too.
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#5f8067] px-8 font-medium text-white transition hover:bg-[#4d6d55] disabled:opacity-60 text-sm"
              >
                {isSubmitting ? "Processing..." : "Send M-Pesa Prompt"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* The wider stewardship navigation, as on the other support pages. */}
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
