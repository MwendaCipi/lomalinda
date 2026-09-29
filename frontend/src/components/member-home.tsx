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
import { useDepartments, type DepartmentRow } from "@/hooks/use-departments";
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

function QuickTile({ tile, className = "" }: { tile: Tile; className?: string }) {
  const Icon = tile.icon;
  return (
    <Link
      href={tile.href}
      className={`group block rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:border-ember hover:shadow-md ${className}`}
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
 * 2. "Your places" — the everyday destinations, beside the week's
 *    announcements at the same width,
 * 3. "Your areas" — how the departments and ministries this member leads are
 *    doing, which only a leader ever sees,
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
  // An officer's queue leads — that badge is the one thing on the page that
  // says something is waiting on them. Everyone else meets the tile as the
  // last entry, where "ask for something" belongs.
  const orderedPlaceTiles = isDesk ? [requestsTile, ...placeTiles] : [...placeTiles, requestsTile];

  // The church's own figures, for the officers who keep the books. The
  // analytics endpoint refuses anyone outside treasury, and the card hides
  // itself if it ever gets a 403, so this gate is a courtesy, not the wall.
  const keepsTheBooks = hasAny(["treasurer", "admin"]);

  // ── The areas this member leads ─────────────────────────────────────────
  // A leadership row in the church's own table is what makes someone answer
  // for an area, so "my areas" is read from that table rather than guessed
  // from role flags: a member who serves nowhere gets no metrics at all.
  const myUsername = me?.username ?? "";
  const myAreas: (DepartmentRow & { as: "leader" | "assistant" })[] = myUsername
    ? departments.flatMap((department) => {
        const mine = department.holders.find((holder) => holder.username === myUsername);
        return mine ? [{ ...department, as: mine.kind }] : [];
      })
    : [];

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
          {isDesk
            ? "The week at church, how the areas you serve are doing, and anything waiting on your answer."
            : "The week at church: what's on, your giving, and anything waiting on you."}
        </p>
      </header>

      {/* The week's announcements lead the page, with the everyday pages
          beside them: the whole announcement card opens the Fellowship feed
          and each one carries its own action — Support, Give input, or its
          conference platform, and the next gathering stands in when nothing
          is published. The tiles share its width in a second column, and on a
          phone they drop underneath rather than being squeezed into a
          sliver. Only the first few show on a wide screen — the rail already
          carries every destination, and a short list is what keeps the two
          panels level. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardAnnouncements />

        <section aria-labelledby="your-places">
          <h2 id="your-places" className="text-base font-bold text-bark">
            Your places
          </h2>
          <p className="mt-1 text-[11px] text-moss">The pages you use most, one tap away.</p>
          {loading || !me ? (
            <p className="mt-4 text-xs text-moss">Loading…</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {orderedPlaceTiles.map((tile, index) => (
                <QuickTile
                  key={tile.href}
                  tile={tile}
                  // Beyond the first two rows the tile is a duplicate of a
                  // rail row, so a wide screen leaves it out. A phone keeps
                  // all of them: there the rail is not on screen.
                  className={index >= 4 ? "lg:hidden" : ""}
                />
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

          {/* The areas this member answers for. A member serving nowhere gets
              no metrics at all — this section exists for leaders, and it is
              the church's own leadership table that decides who that is. */}
          {myAreas.length > 0 && (
            <section aria-labelledby="your-areas">
              <h2 id="your-areas" className="text-base font-bold text-bark">
                Your areas
              </h2>
              <p className="mt-1 text-[11px] text-moss">
                How the departments and ministries you serve are doing.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {myAreas.map((area) => (
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
            </section>
          )}

          {/* The church's own figures — real receipts only, and only ever for
              the officers who keep the books. */}
          {keepsTheBooks && <DashboardQuarterlyGiving />}
        </>
      )}
    </MemberWorkspace>
  );
}
