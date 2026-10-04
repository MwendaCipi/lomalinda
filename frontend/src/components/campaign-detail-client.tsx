"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { localDate } from "@/lib/dates";
import { thankYouPath } from "@/lib/giving-thanks";
import { ArrowLeft, Check, Copy, IdCard, LogIn, X } from "lucide-react";
import { PledgeModal } from "@/components/pledge-modal";
import { InKindGiftModal } from "@/components/in-kind-gift-modal";
import { DonutChart } from "@/components/mini-charts";
import { pieColors } from "@/lib/brand";

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
  // Giving grouped by each giver's age-based department — the church's own
  // reporting categories, one per member.
  department_breakdown?: { department: string; amount: number }[];
  donors?: { name: string; amount: number; gifts: number }[];
  // A nameless pulse of the drive — amount, ministry, day — safe for any viewer.
  recent_gifts?: { amount: number; ministry: string; date?: string | null }[];
}

interface CardAssignment {
  id: number;
  member_name: string;
  group_name: string;
  referral_token: string;
  total_raised: number;
}

const fmtKES = (value: number) => `KES ${Number(value || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

export default function CampaignDetailClient({ openGive = false }: { openGive?: boolean }) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const campaignId = params?.id;
  const refToken = searchParams?.get("ref");
  // The page a visitor is sent to after signing in, so the drive they were
  // invited to is the one they land back on — personal link and all. It is
  // read off the path, so it lands on whichever of the drive's addresses they
  // arrived by (`/fund-drives/<id>`, its `/give-money` door, or an older link).
  const herePath = `${pathname}${refToken ? `?ref=${refToken}` : ""}`;
  const signInHref = `/login?next=${encodeURIComponent(herePath)}`;

  /** Where a visitor lands once their gift is on its way, so giving ends on a
      page that thanks them rather than a modal that simply vanishes. */
  function thanksPath(kind: "money" | "in-kind", method?: "mpesa" | "bank") {
    return thankYouPath({
      kind,
      method,
      campaignId: typeof campaignId === "string" ? campaignId : undefined,
      title: campaign ? campaign.title || campaign.name : undefined,
    });
  }

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [cardAssignment, setCardAssignment] = useState<CardAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // The support form lives in a modal now; the page itself reads as a report.
  // A `/give-money` deep link opens it on arrival.
  const [showSupportModal, setShowSupportModal] = useState(openGive);
  // Pledge and in-kind giving open over the page, like the announcement cards.
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [inKindOpen, setInKindOpen] = useState(false);

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
  // The donor names are an office-holder privilege: admins, elders and the
  // treasurer open the list; everyone else reads the count only.
  const [canSeeDonors, setCanSeeDonors] = useState(false);

  /**
   * Pledging is kept to signed-in members: a pledge is a promise tied to an
   * account, so a visitor who taps it is offered the sign-in door rather than
   * a form that cannot be saved. In-kind giving needs no account — the endpoint
   * records an anonymous gift — so visitors may hand over goods directly.
   */
  function requireSignIn(action: string): boolean {
    if (signedIn) return false;
    showAlert(
      `${action} needs an account`,
      `Sign in to ${action.toLowerCase()} to this fund drive. Giving money and goods does not need an account.`,
      "info"
    );
    router.push(signInHref);
    return true;
  }

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
            const userRoles: string[] =
              Array.isArray(userData.roles) && userData.roles.length > 0
                ? userData.roles.map((r: string) => String(r).toLowerCase().trim())
                : [String(userData.role || "").toLowerCase().trim()];
            setCanSeeDonors(
              userRoles.some((r) => ["admin", "elder", "treasurer"].includes(r)) ||
                Boolean(userData.is_staff || userData.is_superuser)
            );
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
      // first so the receipt reads it.
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
        headers: {
          "Content-Type": "application/json",
          // A signed-in member's gift is attributed by their token; a visitor
          // gives anonymously and is matched to an account later by phone.
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          amount: numericAmount,
          giving_type: "financial",
          purpose: campaign.name,
          phone_number: phoneNumber,
          donor_name: donorName.trim(),
          // Only a signed-in giver's account address is ever emailed; the API
          // drops an address sent by a visitor (see receipt_email_for), so one
          // is never offered to them — their receipt goes by SMS.
          donor_email: signedIn ? donorEmail : "",
          payment_method: "mpesa",
          referral_token: refToken || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || Object.values(data).flat().join(" ") || "Failed to initiate payment.");

      setAmount("");
      setShowSupportModal(false);
      if (signedIn) {
        showAlert("M-Pesa Prompt Sent", "Check your phone for the M-Pesa PIN prompt to complete your contribution.", "success");
      } else {
        // A visitor's giving ends on the public confirmation page, which also
        // carries the way back to the drive and the door to a record.
        router.push(thanksPath("money", "mpesa"));
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
    const shareUrl = shareLink();
    const memberGreeting = cardAssignment ? `\nFund drive link for *${cardAssignment.member_name}* (${cardAssignment.group_name})\n` : "";
    const text = `*SDA Loma Linda Fund Drive*${memberGreeting}\nJoin us in supporting *${campaign.title || campaign.name}*!\n\nTarget Goal: KES ${Number(campaign.target_amount).toLocaleString()}\nRaised so far: KES ${Number(campaign.total_raised).toLocaleString()} (${campaign.percentage_raised}%)\n\nGive online or via mobile money here:\n${shareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  }

  /**
   * The link worth sharing is the drive's public one — `/fund-drives/<id>` — so
   * whoever opens it is never asked to sign in first. A personal referral link
   * keeps its `?ref=` so the gift still credits the member who shared it.
   */
  function shareLink() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/fund-drives/${campaignId}${refToken ? `?ref=${refToken}` : ""}`;
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(shareLink());
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-sand text-bark">
        <div className="px-6 py-16 text-center">
          <p className="text-sm font-medium text-moss">Loading fund drive details...</p>
        </div>
      </main>
    );
  }

  if (error || !campaign) {
    return (
      <main className="min-h-screen bg-sand text-bark">
        <div className="px-6 py-16">
          <div className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-sand-line">
            <h1 className="text-2xl font-semibold">Fund Drive Not Found</h1>
            <p className="mt-2 text-sm text-moss">{error || "The requested fund drive could not be found."}</p>
            {/* A visitor is sent to the public giving page, not the members'
                drives list — that list sits behind the sign-in. */}
            <Link
              href={signedIn ? "/support/campaigns" : "/give"}
              className="mt-6 inline-block rounded-full bg-sage px-6 py-2.5 font-medium text-white"
            >
              {signedIn ? "Return to Fund Drives" : "Go to Giving"}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const breakdown = campaign.contribution_breakdown;
  const deficit = campaign.deficit ?? Math.max(0, Number(campaign.target_amount) - Number(campaign.total_raised));
  // Whole days from today to the drive's last day, in the church's own day.
  const daysLeft = campaign.end_date
    ? Math.round(
        (new Date(`${campaign.end_date}T00:00:00`).getTime() - new Date(`${localDate()}T00:00:00`).getTime()) /
          86_400_000
      )
    : null;

  // A fund drive is a member-facing page — view the card, give, share — so
  // everyone gets the giving sidebar, office holders included. The Leader
  // Portal keeps its own navigation; admin work on drives lives there.
  return (
    <main className="min-h-screen bg-sand text-bark">
      <div className="flex min-h-screen">
        <div className="min-w-0 flex-1">
      <div className="px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-6">
        <div className="mx-auto max-w-5xl space-y-5">
          {/* The way back, top left. A member returns to the drives shelf; a
              visitor — who reached this by a shared link — is sent to Giving,
              which opens for anyone. */}
          <Link
            href={signedIn ? "/support/campaigns" : "/give"}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ember transition hover:text-bark"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            {signedIn ? "Back to Fund Drives" : "Go to Giving"}
          </Link>

          {/* The drive, as one panel: the page can carry several drives, and
              each reads as its own card against the sand behind it. */}
          <div className="space-y-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-sand-line sm:p-5 lg:p-6">
          {/* Personalised link banner */}
          {cardAssignment && (
            <div className="flex items-center justify-between rounded-2xl bg-mist-soft p-4 text-sage-bright ring-1 ring-sage/30">
              <div className="flex items-center gap-3">
                <IdCard size={18} aria-hidden="true" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">Personal Invite Link</p>
                  <p className="text-sm font-semibold">
                    Issued to: <strong className="text-bark">{cardAssignment.member_name}</strong> ({cardAssignment.group_name})
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="block text-[11px] text-sage-mid">Raised via this link</span>
                <span className="text-sm font-bold">KES {Number(cardAssignment.total_raised).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* 1. The drive's story and its giving actions take a full row. */}
          <div className="rounded-3xl bg-sand-card p-6 ring-1 ring-sand-line sm:p-8">
            <h1 className="text-xl font-bold tracking-tight text-bark sm:text-2xl">{campaign.title || campaign.name}</h1>
            {campaign.description ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-moss-soft">{campaign.description}</p>
            ) : (
              <p className="mt-3 text-sm italic text-moss">The office has not written a description for this drive yet.</p>
            )}
            {campaign.account_name && (
              <p className="mt-3 text-xs text-moss">
                Account reference: <code className="rounded-md bg-sand px-2 py-0.5 font-mono font-bold text-ember ring-1 ring-sand-line">{campaign.account_name}</code>
              </p>
            )}

            {/* The giving actions, always one row at every width, left to
                right: Pledge, In-kind, Give Money — the same trio the
                announcement cards offer, called the same thing. Tight side
                padding and no fixed heights keep the three on one line on a
                phone. */}
            {campaign.is_active && (
              <div className="mt-5 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!requireSignIn("Pledging")) setPledgeOpen(true);
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-sand-mute bg-white px-2 py-2.5 text-xs font-bold text-bark transition hover:border-ember hover:text-ember sm:text-sm"
                >
                  Pledge
                </button>
                <button
                  type="button"
                  onClick={() => setInKindOpen(true)}
                  className="inline-flex items-center justify-center rounded-full border border-sand-mute bg-white px-2 py-2.5 text-xs font-bold text-bark transition hover:border-ember hover:text-ember sm:text-sm"
                >
                  In-kind
                </button>
                <button
                  type="button"
                  onClick={() => setShowSupportModal(true)}
                  className="inline-flex items-center justify-center rounded-full bg-sage px-2 py-2.5 text-xs font-bold text-white transition hover:bg-sage-deep sm:text-sm"
                >
                  Give Money
                </button>
              </div>
            )}
          </div>

          {/* 2. Progress, beside the viewer's own contribution breakdown. The
              drive reads as a poster here; the department ring waits below. */}
          {/* The two cards level on a PC — `items-stretch` (the grid default)
              lets each card fill the row's height. */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Progress rides beside the story on a PC, under it on a phone. */}
            <div className="flex flex-col rounded-3xl bg-sand-card p-6 sm:p-8 ring-1 ring-sand-line">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-moss">Fund Drive Progress</span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-bark sm:text-3xl">{fmtKES(campaign.total_raised)}</span>
                  <span className="text-sm text-moss">raised of {fmtKES(campaign.target_amount)} goal</span>
                </div>
                {deficit > 0 && (
                  <p className="mt-1 text-sm font-semibold text-ember">
                    Deficit: {fmtKES(deficit)} <span className="font-normal text-moss">still needed</span>
                  </p>
                )}
                {daysLeft !== null && (
                  <p className="mt-1 text-xs font-semibold text-moss">
                    {daysLeft > 1
                      ? `${daysLeft} days remaining`
                      : daysLeft === 1
                      ? "1 day remaining"
                      : daysLeft === 0
                      ? "Closes today"
                      : "This drive has ended"}
                  </p>
                )}
              </div>
              {/* Percent and donors split the width equally on a phone. The
                  donor badge opens the names only for the officers who may see
                  them; everyone else reads the count as a plain figure. */}
              {/* The figures read one size smaller so a wide amount never
                  outgrows its box on a phone. */}
              <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-2">
                <div className="rounded-2xl bg-white px-4 py-2 text-center ring-1 ring-sand-line">
                  <span className="block text-xs text-moss">Percentage</span>
                  <span className="whitespace-nowrap text-base font-bold text-sage">{campaign.percentage_raised}%</span>
                </div>
                {canSeeDonors ? (
                  <button
                    type="button"
                    onClick={() => setShowDonors((open) => !open)}
                    aria-expanded={showDonors}
                    className="rounded-2xl bg-white px-4 py-2 text-center ring-1 ring-sand-line transition hover:ring-ember"
                  >
                    <span className="block text-xs text-moss">Donors</span>
                    <span className="whitespace-nowrap text-base font-bold text-gold-deep">{campaign.donor_count}</span>
                  </button>
                ) : (
                  <div className="rounded-2xl bg-white px-4 py-2 text-center ring-1 ring-sand-line">
                    <span className="block text-xs text-moss">Donors</span>
                    <span className="whitespace-nowrap text-base font-bold text-gold-deep">{campaign.donor_count}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-sand-sheen">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold-deep via-sage to-sage-bright transition-all duration-700"
                style={{ width: `${Math.min(100, campaign.percentage_raised)}%` }}
              />
            </div>

            {/* Donor list, revealed by the donor badge — officers only. */}
            {showDonors && canSeeDonors && (
              <div className="mt-5 rounded-2xl border border-sand-line bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-bark">Donors</h3>
                  <button type="button" onClick={() => setShowDonors(false)} className="text-xs font-semibold text-moss hover:text-ember">
                    Hide
                  </button>
                </div>
                {(campaign.donors ?? []).length === 0 ? (
                  <p className="mt-3 text-xs text-moss">No completed gifts yet — be the first to give.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-sand-light">
                    {(campaign.donors ?? []).map((d, i) => (
                      <li key={i} className="flex items-center justify-between py-2 text-sm">
                        <span className="min-w-0 truncate font-medium text-bark">{d.name}</span>
                        <span className="ml-3 shrink-0 text-right">
                          <span className="font-bold text-gold-deep">{fmtKES(d.amount)}</span>
                          <span className="ml-2 text-[11px] text-moss">
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
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-sand-line bg-white px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-bark transition hover:bg-sand"
              >
                <span className="truncate inline-flex items-center gap-1.5">{copySuccess ? <><Check size={12} aria-hidden="true" /> Link Copied!</> : <><Copy size={12} aria-hidden="true" /> Copy Link</>}</span>
              </button>
            </div>
          </div>

            {/* The viewer's own contribution breakdown. */}
            <div className="flex flex-col rounded-3xl bg-sand-card p-6 ring-1 ring-sand-line">
              <h3 className="text-base font-bold text-bark">
                {signedIn ? "My Contribution Breakdown" : "Contribution Breakdown"}
              </h3>

              {breakdown && signedIn ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-sand-card p-3 ring-1 ring-sand-line">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-moss">My contribution</span>
                    <span className="mt-0.5 block text-base font-bold text-sage-bright">{fmtKES(breakdown.my_amount)}</span>
                    <span className="text-[11px] text-moss">{breakdown.my_gifts} gift{breakdown.my_gifts === 1 ? "" : "s"}</span>
                  </div>
                  <div className="rounded-2xl bg-sand-card p-3 ring-1 ring-sand-line">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-moss">My invitees</span>
                    <span className="mt-0.5 block text-base font-bold text-gold-deep">{fmtKES(breakdown.invitees_amount)}</span>
                    <span className="text-[11px] text-moss">
                      {breakdown.invitees_gifts} gift{breakdown.invitees_gifts === 1 ? "" : "s"}
                      {breakdown.invitee_names.length > 0 && ` · ${breakdown.invitee_names.join(", ")}`}
                    </span>
                  </div>
                  <div className="rounded-2xl bg-sand-card p-3 ring-1 ring-sand-line">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-moss">Others</span>
                    <span className="mt-0.5 block text-base font-bold text-sage">{fmtKES(breakdown.others_amount)}</span>
                  </div>
                  <div className="rounded-2xl bg-sand-card p-3 ring-1 ring-sand-line">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-moss">Total raised</span>
                    <span className="mt-0.5 block text-base font-bold text-bark">{fmtKES(breakdown.total_raised)}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-xl bg-sand-card px-4 py-6 text-center text-xs text-moss">
                  {signedIn
                    ? "No gifts recorded yet on this drive."
                    : "Sign in to see your own contribution and invitees in this breakdown."}
                </p>
              )}
            </div>
          </div>

          {/* Giving by the church's own age-based departments — the reporting
              categories the office reads. The ring carries each department's
              share; the legend beside it names them. */}
          <div className="rounded-3xl bg-sand-card p-6 ring-1 ring-sand-line sm:p-8">
            <h3 className="text-base font-bold text-bark">Contribution by Department</h3>
            <p className="mt-1 text-xs text-moss">
              Where the drive&apos;s giving comes from, grouped by each giver&apos;s department.
            </p>
            <div className="mt-5">
              <DonutChart
                items={(campaign.department_breakdown ?? []).map((row, index) => ({
                  label: row.department,
                  value: Number(row.amount) || 0,
                  color: pieColors[index % pieColors.length],
                }))}
                centerLabel="raised"
                centerValue={fmtKES(campaign.total_raised)}
                emptyLabel="No gifts recorded on this drive yet."
              />
            </div>
          </div>

          {/* Ministry-group leaderboard, for drives issued by group. */}
          {campaign.top_fundraisers && campaign.top_fundraisers.length > 0 && (
            <div className="rounded-3xl bg-sand-card p-6 ring-1 ring-sand-line">
              <h3 className="text-base font-bold text-bark">Top Fundraisers</h3>
              <div className="mt-4 space-y-3">
                {campaign.top_fundraisers.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-sand-light pb-2">
                    <div>
                      <span className="font-semibold text-bark">{i + 1}. {f.name}</span>
                      <span className="block text-[11px] text-moss">{f.group}</span>
                    </div>
                    <span className="font-bold text-gold-deep">{fmtKES(f.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* A visitor is offered the sign-in door here, at the foot of the page,
          without it ever standing between them and giving. */}
      {!signedIn && (
        <div className="px-4 pb-10 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sand-line sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="text-sm font-semibold text-bark">Want to keep a record of your giving?</p>
              <p className="mt-0.5 text-xs text-moss">
                Sign in to see your own contributions, pledge towards the drive, and share a personal invite link. Giving money or goods needs no account.
              </p>
            </div>
            <Link
              href={signInHref}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-bark px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-bark-deep sm:text-sm"
            >
              <LogIn size={14} aria-hidden="true" /> Sign in
            </Link>
          </div>
        </div>
      )}

      {/* Pledge and in-kind giving open over the page, exactly as they do on
          the announcement cards. The drive owns the pledge record. */}
      <PledgeModal
        open={pledgeOpen}
        onClose={() => setPledgeOpen(false)}
        target={{
          id: campaign.id,
          title: campaign.title || campaign.name,
          kind: "campaign",
          support_account_display: campaign.account_name || campaign.name,
          event_date_to: campaign.end_date ?? null,
        }}
      />
      <InKindGiftModal
        open={inKindOpen}
        onClose={() => setInKindOpen(false)}
        defaultPurpose={campaign.account_name || campaign.name}
        announcementTitle={campaign.title || campaign.name}
        onRecorded={() => {
          // A signed-in record keeps the modal's own toast; a visitor is sent
          // to the public confirmation page instead.
          if (!signedIn) router.push(thanksPath("in-kind"));
        }}
      />

      {/* ── Support modal ── */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-modal-title"
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
          >
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 id="support-modal-title" className="text-lg font-bold text-bark">
                Support {campaign.title || campaign.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowSupportModal(false)}
                className="rounded-full p-1.5 text-moss transition hover:bg-sand hover:text-bark"
                aria-label="Close"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>

            {cardAssignment && (
              <p className="mt-3 rounded-xl bg-mist-soft px-3 py-2 text-xs text-sage-bright">
                Credited to {cardAssignment.member_name}&apos;s invite ({cardAssignment.group_name}).
              </p>
            )}

            <form onSubmit={handleDonate} className="mt-4 space-y-4">
              {/* Name: typed freely; signed-in givers arrive pre-filled. No
                  email is collected from visitors — receipts go by SMS. */}
              <label className="block text-sm font-medium text-bark">
                Name
                <input
                  type="text"
                  placeholder="Your name"
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                />
              </label>

              <label className="block text-sm font-medium text-bark">
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
                  className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                />
              </label>

              <label className="block text-sm font-medium text-bark">
                Contribution Amount (KES) *
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 1000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                />
              </label>

              {signedIn ? (
                <label className="block text-sm font-medium text-bark">
                  Email <span className="font-normal text-moss">(optional — for your receipt)</span>
                  <input
                    type="email"
                    value={donorEmail}
                    onChange={(e) => setDonorEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                  />
                </label>
              ) : (
                <p className="text-[11px] leading-relaxed text-moss">
                  No account needed — your receipt is sent by SMS to the number you give.{" "}
                  <Link href={signInHref} className="font-semibold text-ember hover:underline">
                    Sign in
                  </Link>{" "}
                  to get it by email too and keep a record of your giving.
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-sage px-8 font-medium text-white transition hover:bg-sage-deep disabled:opacity-60 text-sm"
              >
                {isSubmitting ? "Processing..." : "Send M-Pesa Prompt"}
              </button>
            </form>
          </div>
        </div>
      )}

        </div>
      </div>
    </main>
  );
}
