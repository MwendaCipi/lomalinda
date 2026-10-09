"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Landmark, UserRoundCheck, type LucideIcon } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { REQUESTS_TILE, dashboardTiles, destinationOf } from "@/config/navigation";
import { DashboardAnnouncements } from "@/components/dashboard-announcements";
import { DashboardAnalytics } from "@/components/dashboard-analytics";
import { DashboardChurchPulse } from "@/components/dashboard-church-pulse";
import { useDepartments, useMyTies, type DepartmentRow } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { usePendingRequestCounts } from "@/hooks/use-pending-request-counts";
import { useTreasuryAwaitingCounts } from "@/hooks/use-treasury-awaiting-counts";
import { MemberWorkspace } from "@/components/member-workspace";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type ProfileChange = {
  id: number;
  changes: Record<string, string | null>;
  proposed_by_name: string;
  proposed_at: string;
};

/** One quick tile, already resolved to a href/label/icon. */
type Tile = {
  href: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  /** How much is waiting behind it — only the Requests desk carries one. */
  badge?: number;
  /** The badge's own wording, when the default ("requests awaiting review") is not what it counts. */
  badgeTitle?: string;
  /** A card that fills its row rather than sharing one — the treasurer's tile reads both of its queues on one line. */
  wide?: boolean;
};

/** One everyday place, as a card. */
function QuickTile({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  return (
    <Link
      href={tile.href}
      className={`group block rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:border-ember hover:shadow-md${tile.wide ? " col-span-2" : ""}`}
    >
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-mist-select text-bark transition group-hover:bg-gold">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <h3 className="text-sm font-bold text-bark">{tile.label}</h3>
        {tile.badge ? (
          <span
            title={tile.badgeTitle ?? `${tile.badge} request${tile.badge === 1 ? "" : "s"} awaiting review`}
            className="rounded-full bg-ember px-1.5 py-0.5 text-[10px] font-bold text-white"
          >
            {tile.badge}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-moss">{tile.desc}</p>
    </Link>
  );
}

/**
 * The member dashboard, in role-tailored tiers.
 *
 * Every member opens on the same page and the page reshapes itself around who
 * they are, rather than sending officers to a second console:
 *
 * 1. the week's announcement across the top, then anything waiting on the
 *    member personally (a proposed profile edit they must approve or decline),
 * 2. "Your roles" — how the departments and ministries this member serves in
 *    are doing, naming the office they hold there, for anyone with a row in
 *    the leadership table,
 * 3. the congregation — its roll, its folds, and what the desks still owe
 *    somebody an answer on, for the offices that shepherd it,
 * 4. the church's finances, for the officers who keep the books.
 *
 * The everyday destinations sit beside the week's announcements as four quick
 * tiles — announcements, giving, requests and the calendar — with no heading,
 * since four named cards do not need one to be read. On a phone they drop
 * beneath the announcement card. The treasurer's own tile joins them as a
 * fifth, full-row card saying what is still waiting on their decision — the
 * two queues nobody else is allowed to see counted. Everything else the page says is what only
 * this page can say: the week, what is waiting on you, and how the church you
 * serve is doing.
 *
 * The rail is that same member workspace every page under it renders, so
 * the logo at its head comes back here without ever losing the rail.
 */
export function MemberHome() {
  const router = useRouter();
  // Identity comes from the cached header hook — the same /me/ the site
  // header already holds — so the dashboard costs no profile fetch of its own.
  const { me, hasToken } = useHeaderData();
  const departments = useDepartments();
  const [profileChange, setProfileChange] = useState<ProfileChange | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [loading, setLoading] = useState(true);
  /** False until the hook's first pass has looked at localStorage. */
  const [tokenChecked, setTokenChecked] = useState(false);

  useEffect(() => {
    setTokenChecked(true);
  }, []);

  useEffect(() => {
    // The hook's hasToken flips inside its layout effect, one tick after this
    // effect can run — bailing on its first render would bounce an entirely
    // valid session to /login, which would then find the token and bounce
    // back: the "Taking you in…" loop. So wait it out and only redirect when
    // the check has actually completed signed-out.
    if (!tokenChecked) return;
    if (!hasToken) {
      router.replace("/login?next=/dashboard");
      return;
    }
    const token = localStorage.getItem("access_token");
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    // A proposed profile edit waits here for the member's own yes or no.
    fetch(`${API_URL}/api/members/me/profile-changes/`, { headers })
      .then((res) => (res.ok ? res.json() : { pending: false }))
      .then((data) => setProfileChange(data?.pending ? (data.change_request as ProfileChange) : null))
      .catch(() => setProfileChange(null))
      .finally(() => setLoading(false));
  }, [hasToken, tokenChecked, router]);

  const roles = me?.roles && me.roles.length > 0 ? me.roles : [me?.role || "member"];

  const hasAny = (list: string[]) => list.some((r) => roles.includes(r));

  // The offices that shepherd the congregation. This is the church's own
  // office set — the elder, the clerk, the pastor and the administrator — and
  // it matches the gate on the pulse endpoint, which refuses anyone else.
  const isChurchOffice = hasAny(["admin", "elder", "clerk", "pastor"]);

  // The church's own figures, for the officers who keep the books. The
  // analytics endpoint refuses anyone outside treasury, and the panel hides
  // itself if it ever gets a 403, so this gate is a courtesy, not the wall.
  const keepsTheBooks = hasAny(["treasurer", "admin"]);

  // Leadership lands on the desks, not on the member-facing pages: a clerk or
  // elder tapping Requests wants the desk that answers requests, and the desk
  // carries the number still waiting so the tile says whether it needs them.
  const isDesk = hasAny(REQUESTS_TILE.deskAudience);

  // What leadership still owes an answer on, from the same hook the sidebar's
  // badge and the Requests manager read — the three can never disagree.
  const pendingRequests = usePendingRequestCounts(isDesk);

  // What is still waiting on the treasurer: department withdrawal requests and
  // fund drives awaiting the treasurer's approval. Only the treasurer and
  // administrators reach this — same gate as the analytics panel.
  const treasuryAwaiting = useTreasuryAwaitingCounts(keepsTheBooks);

  // ── The quick tiles ──────────────────────────────────────────────────────
  // The four everyday actions, beside the week's announcements. Requests keeps
  // its two faces — the desk for the offices that answer requests, the forms
  // for everyone else — and only the desk's face carries a count.
  const quickTiles: Tile[] = dashboardTiles.map((key) => {
    if (key === "requests") {
      return isDesk
        ? {
            href: REQUESTS_TILE.deskHref,
            label: REQUESTS_TILE.label,
            desc: REQUESTS_TILE.deskDescription,
            icon: ClipboardList,
            badge: pendingRequests.total,
          }
        : {
            href: REQUESTS_TILE.memberHref,
            label: REQUESTS_TILE.label,
            desc: REQUESTS_TILE.memberDescription,
            icon: ClipboardList,
          };
    }
    const dest = destinationOf(key);
    return {
      href: dest.href,
      label: dest.label,
      desc: dest.description ?? "",
      icon: dest.icon,
    };
  });

  // The treasurer's own tile, beside the four everyday ones: both queues the
  // desk keeps — the department withdrawal requests and the fund drives — as
  // one card saying how many of each are still waiting on this officer's
  // decision. The gate mirrors the endpoint's exactly: the tile appears only
  // for the roles the API answers, so no member is ever shown a card that
  // could only come back refused. It fills its row rather than leaving a
  // fifth card alone in a half-empty one.
  if (keepsTheBooks) {
    const awaitingTotal = treasuryAwaiting.withdrawal_requests + treasuryAwaiting.fund_drives;
    quickTiles.push({
      href: "/administration?tab=accounts&view=withdrawals",
      label: "Treasury",
      desc: treasuryAwaiting.loading
        ? "Withdrawal requests and fund drives waiting on you."
        : awaitingTotal === 0
          ? "No withdrawal requests or fund drives waiting."
          : [
              treasuryAwaiting.withdrawal_requests > 0
                ? `${treasuryAwaiting.withdrawal_requests} withdrawal request${treasuryAwaiting.withdrawal_requests === 1 ? "" : "s"}`
                : null,
              treasuryAwaiting.fund_drives > 0
                ? `${treasuryAwaiting.fund_drives} fund drive${treasuryAwaiting.fund_drives === 1 ? "" : "s"}`
                : null,
            ]
              .filter(Boolean)
              .join(" and ") + " waiting on you",
      icon: Landmark,
      badge: awaitingTotal > 0 ? awaitingTotal : undefined,
      badgeTitle:
        awaitingTotal > 0
          ? `${awaitingTotal} item${awaitingTotal === 1 ? "" : "s"} awaiting your decision`
          : undefined,
      wide: true,
    });
  }

  // ── The areas this member belongs to ────────────────────────────────────
  // Two sources, one list: the leadership table names the offices a member
  // holds ("Treasurer", not the generic kind), and /me/'s my_ties names the
  // areas they genuinely belong to or serve in — a department or ministry
  // they are part of without leading. Either tie puts the area on the card;
  // the badge says which way the member holds it. An office account's wider
  // every-area view is deliberately not used here: an administrator sees the
  // areas that are theirs, and reaches the rest through the rail.
  const myUsername = me?.username ?? "";
  const myMembershipCodes = useMyTies();
  const myAreas: (DepartmentRow & { as: string })[] = myUsername
    ? departments.flatMap((department) => {
        const offices = department.holders
          .filter((holder) => holder.username === myUsername)
          .map((holder) => (holder.role || (holder.kind === "assistant" ? "Assistant" : "Leader")));
        const belongs = myMembershipCodes.includes(department.code);
        if (offices.length === 0 && !belongs) return [];
        return [{ ...department, as: offices.length > 0 ? offices.join(" · ") : "Member" }];
      })
    : [];

  // The cards wrap in balanced rows — three to a row, except four, which
  // splits two and two rather than three and a loner. Five reads three and
  // two, six three and three.
  const areaRowSizes: number[] =
    myAreas.length === 4
      ? [2, 2]
      : Array.from({ length: Math.ceil(myAreas.length / 3) }, (_, i) => Math.min(3, myAreas.length - i * 3));
  let areaCursor = 0;
  const areaChunks = areaRowSizes.map((size) => myAreas.slice(areaCursor, (areaCursor += size)));

  const firstName = me?.name?.split(" ")[0] ?? "";
  const greeting = firstName ? `Welcome back, ${firstName}` : "Welcome back";

  const FIELD_LABELS: Record<string, string> = {
    first_name: "First name",
    last_name: "Last name",
    email: "Email",
    phone_number: "Phone number",
    whatsapp_number: "WhatsApp number",
    profession: "Profession",
    gender: "Sex",
    date_of_birth: "Date of birth",
    gifts: "Gifts & talents",
    disability: "Disability / special needs",
  };

  const decideProfileChange = async (decision: "approve" | "keep") => {
    setDeciding(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/members/me/profile-changes/decide/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not record your decision.");
      setProfileChange(null);
      showAlert(
        decision === "approve" ? "Profile updated" : "Details kept",
        data.detail || (decision === "approve" ? "Your profile has been updated." : "Your details stay as they are."),
        "success",
      );
    } catch (error) {
      showAlert("Not recorded", error instanceof Error ? error.message : "Could not record your decision.", "error");
    } finally {
      setDeciding(false);
    }
  };

  return (
    <MemberWorkspace>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{greeting}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-moss">
          {"The week at church: what's on, your giving, and anything waiting on you."}
        </p>
      </header>

      {/* The week's announcements lead the page, with the quick tiles beside
          them on a wide screen: the whole announcement card opens the
          Fellowship feed and each one carries its own action — Support, Give
          input, or its conference platform — and the next gathering stands in
          when nothing is published. The tiles carry no heading — four named
          cards do not need one — and on a phone they drop beneath the card
          rather than being squeezed into a sliver. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardAnnouncements />
        <section aria-label="Quick actions">
          {loading || !me ? (
            <p className="text-xs text-moss">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {quickTiles.map((tile) => (
                <QuickTile key={tile.href} tile={tile} />
              ))}
            </div>
          )}
        </section>
      </div>

      {loading || !me ? (
        <p className="text-center text-sm text-moss">Loading your dashboard…</p>
      ) : (
        <>
          {/* Anything waiting on the member personally leads the tiers below:
              nothing on their record moves until they choose here. */}
          {profileChange && (
            <section
              aria-live="polite"
              className="rounded-2xl border border-gold-soft bg-sand-cream p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-center gap-2">
                <UserRoundCheck className="h-4 w-4 text-ember" />
                <h2 className="text-base font-bold text-bark">The church office proposed an update to your profile</h2>
              </div>
              <p className="mt-1 text-xs text-moss">
                Proposed by {profileChange.proposed_by_name}. Nothing changes until you approve it.
              </p>
              <ul className="mt-3 space-y-1.5">
                {Object.entries(profileChange.changes).map(([field, value]) => (
                  <li key={field} className="text-sm text-bark">
                    <span className="font-semibold">{FIELD_LABELS[field] || field}:</span>{" "}
                    <span className="text-moss">{value === null || value === "" ? "—" : String(value)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={deciding}
                  onClick={() => decideProfileChange("approve")}
                  className="rounded-full bg-bark px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-ember disabled:opacity-60"
                >
                  {deciding ? "Saving…" : "Approve update"}
                </button>
                <button
                  type="button"
                  disabled={deciding}
                  onClick={() => decideProfileChange("keep")}
                  className="rounded-full border border-sand-mute bg-white px-5 py-2.5 text-xs font-semibold text-moss transition hover:border-ember disabled:opacity-60"
                >
                  Keep my details
                </button>
              </div>
            </section>
          )}

          {/* The areas this member belongs to — departments and ministries
              alike, whether they hold an office there or only a place on the
              roll. The badge names the tie: the office itself where one is
              held, "Member" where the tie is belonging. A member serving
              nowhere sees nothing here; the rail carries the invitation. */}
          {myAreas.length > 0 && (
            <section aria-labelledby="your-areas">
              <h2 id="your-areas" className="text-base font-bold text-bark">
                Your departments &amp; ministries
              </h2>
              <p className="mt-1 text-[11px] text-moss">
                The departments and ministries you belong to, and how they are doing.
              </p>
              {areaChunks.map((chunk, rowIndex) => (
                <div
                  key={rowIndex}
                  className="mt-4 grid grid-cols-1 gap-3 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
                  style={{ "--cols": chunk.length } as React.CSSProperties}
                >
                  {chunk.map((area) => (
                    <Link
                      key={area.code}
                      href={`/administration?tab=leaders&dept=${area.code}`}
                      className="group rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:border-ember hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-bark">{area.label}</h3>
                        <span className="shrink-0 rounded-full bg-mist-select px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-bark">
                          {area.as}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-lg font-semibold leading-tight text-bark">{area.memberCount}</p>
                          <p className="text-[11px] leading-tight text-moss">on the roll</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold leading-tight text-bark">{area.eventCount}</p>
                          <p className="text-[11px] leading-tight text-moss">on the calendar</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
            </section>
          )}

          {/* The congregation's own numbers, for the offices that shepherd it:
              the roll and its folds, and what the desks still owe somebody an
              answer on. Nobody else sees this card. */}
          {isChurchOffice && <DashboardChurchPulse />}

          {/* The church's own figures — real receipts only, and only ever for
              the officers who keep the books. */}
          {keepsTheBooks && <DashboardAnalytics />}
        </>
      )}
    </MemberWorkspace>
  );
}
