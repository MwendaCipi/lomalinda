"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  UserRoundCheck,
} from "lucide-react";
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type ProfileChange = {
  id: number;
  changes: Record<string, string | null>;
  proposed_by_name: string;
  proposed_at: string;
};

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
  const isDesk = hasAny(["elder", "admin", "clerk", "pastor", "chaplaincy", "welfare_leader", "children_ministry"]);

  // What leadership still owes an answer on, from the same hook the sidebar's
  // badge and the Requests manager read — the three can never disagree.
  const pendingRequests = usePendingRequestCounts(isDesk);

  // ── Role-tailored quick tiles ───────────────────────────────────────────
  // Built from the nav registry: every tile's label, description, icon and
  // href come from one canonical entry, so a tile cannot rename a place the
  // bars and footer call something else. Requests keeps its two faces — the
  // desk for the offices that answer them, the forms for everyone else.
  const tileList = [
    ...dashboardTiles
      .filter((spec) => !spec.audience || spec.audience.some((r) => roles.includes(r)))
      .map((spec: TileSpec) => {
        const dest = destinationOf(spec.key);
        const href = spec.tab ? `${dest.href}?tab=${spec.tab}` : dest.href;
        return {
          href,
          label: spec.task ?? dest.label,
          desc: spec.description ?? dest.description ?? "",
          icon: dest.icon,
          badge: undefined as number | undefined,
        };
      }),
    // The Requests tile: leadership goes to the desk (badge = waiting count),
    // members to the forms.
    isDesk
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
        },
  ];

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
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      {/* The week's announcements lead the page: the whole card opens the
          Fellowship feed, and each announcement carries its own action —
          Support, Give input, or its conference platform. When nothing is
          published the next gathering stands in. */}
      <DashboardAnnouncements />

      {loading || !me ? (
        <p className="mt-8 text-center text-sm text-moss">Loading your dashboard…</p>
      ) : (
        <>
          {/* A proposed profile edit, awaiting the member's own approval.
              Nothing on their record moves until they choose here. */}
          {profileChange && (
            <section
              aria-live="polite"
              className="mt-6 rounded-2xl border border-gold-soft bg-sand-cream p-5 shadow-sm sm:p-6"
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

          {/* Quick tiles */}
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tileList.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="group rounded-2xl border border-sand-line bg-white p-4 shadow-sm transition hover:border-ember hover:shadow-md"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-mist-select text-bark transition group-hover:bg-gold">
                  <t.icon className="h-4 w-4" />
                </span>
                <span className="mt-2.5 flex items-center gap-1.5">
                  <h2 className="text-sm font-bold text-bark">{t.label}</h2>
                  {"badge" in t && t.badge ? (
                    <span
                      title={`${t.badge} request${t.badge === 1 ? "" : "s"} awaiting review`}
                      className="rounded-full bg-ember px-1.5 py-0.5 text-[10px] font-bold text-white"
                    >
                      {t.badge}
                    </span>
                  ) : null}
                </span>
                <p className="mt-0.5 text-[11px] leading-snug text-moss">{t.desc}</p>
              </Link>
            ))}
          </section>

          {/* Quarterly giving — the year's quarters, for the officers who
              keep the books. It asks the same analytics endpoint the Church
              finances panel used, which refuses anyone outside treasury. */}
          {hasAny(["treasurer", "admin"]) && <DashboardQuarterlyGiving />}
        </>
      )}
    </main>
  );
}
