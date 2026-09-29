"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, UserRoundCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  dashboardTiles,
  destinationOf,
  REQUESTS_TILE,
  type TileSpec,
} from "@/config/navigation";
import { showAlert } from "@/lib/alerts";
import { DashboardAnnouncements } from "@/components/dashboard-announcements";
import { usePendingRequestCounts } from "@/hooks/use-pending-request-counts";
import { DashboardQuarterlyGiving } from "@/components/dashboard-quarterly-giving";
import { useHeaderData } from "@/hooks/use-header-data";
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
  badge?: number;
};

function QuickTile({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  return (
    <Link
      href={tile.href}
      className="group rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:border-ember hover:shadow-md"
    >
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-mist-select text-bark transition group-hover:bg-gold">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <h3 className="text-sm font-bold text-bark">{tile.label}</h3>
        {tile.badge ? (
          <span
            title={`${tile.badge} request${tile.badge === 1 ? "" : "s"} awaiting review`}
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
 * 1. the week's announcement, then anything waiting on the member personally
 *    (a proposed profile edit they must approve or decline),
 * 2. "Your places" — the everyday destinations,
 * 3. "The desks you serve" — the office pages this member's roles reach,
 * 4. the church's finances, for the officers who keep the books.
 *
 * The rail beside it is the same member workspace every page under it renders,
 * so tapping "Dashboard" from the rail no longer loses the rail.
 */
export function MemberHome() {
  const router = useRouter();
  // Identity comes from the cached header hook — the same /me/ the site
  // header already holds — so the dashboard costs no profile fetch of its own.
  const { me, hasToken } = useHeaderData();
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

  // Leadership lands on the desks, not on the member-facing pages: a clerk or
  // elder tapping Requests wants the desk that answers requests, and the desk
  // carries the number still waiting so the tile says whether it needs them.
  const isDesk = hasAny(REQUESTS_TILE.deskAudience);

  // What leadership still owes an answer on, from the same hook the sidebar's
  // badge and the Requests manager read — the three can never disagree.
  const pendingRequests = usePendingRequestCounts(isDesk);

  // ── Role-tailored quick tiles ───────────────────────────────────────────
  // Built from the nav registry: every tile's label, description, icon and
  // href come from one canonical entry, so a tile cannot rename a place the
  // bars and footer call something else. The office entries are separated out
  // so they can sit under their own heading instead of mingling with the
  // everyday ones — a member who is not an officer simply has no second tier.
  const visibleSpecs = dashboardTiles.filter(
    (spec) => !spec.audience || spec.audience.some((r) => roles.includes(r)),
  );

  const toTile = (spec: TileSpec): Tile => {
    const dest = destinationOf(spec.key);
    return {
      href: spec.tab ? `${dest.href}?tab=${spec.tab}` : dest.href,
      label: spec.task ?? dest.label,
      desc: spec.description ?? dest.description ?? "",
      icon: dest.icon,
    };
  };

  // The Requests tile keeps its two faces: the desk for the offices that
  // answer requests, the forms for everyone else.
  const requestsTile: Tile = isDesk
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

  const placeTiles = visibleSpecs.filter((spec) => spec.key !== "administration").map(toTile);
  const deskTiles = visibleSpecs.filter((spec) => spec.key === "administration").map(toTile);
  // An officer's queue leads — that badge is the one thing on the page that
  // says something is waiting on them. Everyone else meets the tile as the
  // last entry, where "ask for something" belongs.
  const orderedPlaceTiles = isDesk ? [requestsTile, ...placeTiles] : [...placeTiles, requestsTile];

  // The church's own figures, for the officers who keep the books. The
  // analytics endpoint refuses anyone outside treasury, and the card hides
  // itself if it ever gets a 403, so this gate is a courtesy, not the wall.
  const keepsTheBooks = hasAny(["treasurer", "admin"]);

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
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          {isDesk ? "Member & office space" : "Member space"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{greeting}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-moss">
          {isDesk
            ? "The week at church, plus the desks your role carries — requests, records and the church's figures."
            : "The week at church: what's on, your giving, and anything waiting on you."}
        </p>
      </header>

      {/* The week's announcements lead the page: the whole card opens the
          Fellowship feed, and each announcement carries its own action —
          Support, Give input, or its conference platform. When nothing is
          published the next gathering stands in. */}
      <DashboardAnnouncements />

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

          {/* Tier one: the everyday places. The rail lists some of these too —
              it is desktop-only, so the tiles stay the way there on a phone. */}
          <section aria-labelledby="your-places">
            <h2 id="your-places" className="text-base font-bold text-bark">
              Your places
            </h2>
            <p className="mt-1 text-[11px] text-moss">The pages you use most, one tap away.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {orderedPlaceTiles.map((tile) => (
                <QuickTile key={tile.href} tile={tile} />
              ))}
            </div>
          </section>

          {/* Tier two: the office. Only roles that reach the console see it. */}
          {deskTiles.length > 0 && (
            <section aria-labelledby="your-desks">
              <h2 id="your-desks" className="text-base font-bold text-bark">
                The desks you serve
              </h2>
              <p className="mt-1 text-[11px] text-moss">
                The office pages your role reaches, opening on the tab you need.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {deskTiles.map((tile) => (
                  <QuickTile key={tile.href} tile={tile} />
                ))}
              </div>
            </section>
          )}

          {/* Tier three: the church's own figures — real receipts only, and
              only ever for the officers who keep the books. */}
          {keepsTheBooks && <DashboardQuarterlyGiving />}
        </>
      )}
    </MemberWorkspace>
  );
}
