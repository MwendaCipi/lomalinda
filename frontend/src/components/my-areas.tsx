"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Info, UserPlus, UserRound, Users, Wallet } from "lucide-react";

import { usePageHeader } from "@/components/app-frame";
import { SubNav } from "@/components/sub-nav";
import { showAlert } from "@/lib/alerts";
import { useAllDepartments, useMyTies } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { dayFirst } from "@/lib/dates";
import { DepartmentAccountsPanel } from "@/components/department-hub";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One person on an area's roll, as the desk's own endpoint reports them. */
type RollRow = { id: number; name: string; unit: string; via: string };

/** One entry of an area's calendar. */
type AreaEvent = {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  lead: string;
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * The two fellowships that are one sex's own: the men's ministry and the
 * women's. A member of the other sex may still belong by the desk's own
 * hand, but may not ask to join — so the card is not offered them.
 */
const SEX_ONLY_AREA: Record<string, "male" | "female"> = {
  amm: "male",
  awm: "female",
};

type AreaTab = "mine" | "other";

const TAB_LABELS: Record<AreaTab, string> = { mine: "My Ministry", other: "Other Ministries" };

const LEGACY_DEPARTMENT_CODES: Record<string, string> = {
  children: "children",
  young_adults: "aym",
};

/**
 * My areas — the church's ministries and departments as the member's own map.
 *
 * One page, two sub-navs: the member's own areas and the other
 * ministries/departments they may ask to join. Opening a card reads the area —
 * its leadership, its roll, its calendar, and its accounts & withdrawals —
 * with withdrawal requests enabled for leaders.
 */
export function MyAreas() {
  const rows = useAllDepartments();
  const ties = useMyTies();
  const { me } = useHeaderData();
  const sex = (me?.gender || "").trim().toLowerCase();

  const [tab, setTab] = useState<AreaTab>("mine");
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [areaView, setAreaView] = useState<"members" | "calendar" | "accounts">("members");
  const [joining, setJoining] = useState<string | null>(null);
  const legacyDepartmentCode = (me?.department || "").trim();
  const ownDepartmentCode = (me?.department_ref || LEGACY_DEPARTMENT_CODES[legacyDepartmentCode] || legacyDepartmentCode).trim();

  /** May the member ask to join this area? The two sex-only fellowships say no
      to the other sex; every other ministry and department is open. */
  const canJoin = useCallback((code: string) => {
    const only = SEX_ONLY_AREA[code];
    return !only || !sex || only === sex;
  }, [sex]);

  const isMyMinistry = useCallback((area: (typeof rows)[number]) => {
    return area.code === ownDepartmentCode || ties.includes(area.code);
  }, [ownDepartmentCode, ties]);

  // What the member sees: first the areas they belong to or serve in, then
  // other areas open for a join request. Sex-only ministries stay hidden from
  // people who may not request them.
  const visible = useMemo(
    () =>
      rows
        .filter((area) => {
          const mine = isMyMinistry(area);
          if (tab === "mine") return mine;
          return !mine && !ties.includes(area.code) && canJoin(area.code);
        })
        .sort((a, b) => {
          if (tab === "mine") {
            const departmentA = a.code === ownDepartmentCode ? 0 : 1;
            const departmentB = b.code === ownDepartmentCode ? 0 : 1;
            if (departmentA !== departmentB) return departmentA - departmentB;
          }
          const groupA = a.group === "ministry" ? 0 : 1;
          const groupB = b.group === "ministry" ? 0 : 1;
          return groupA - groupB || a.label.localeCompare(b.label);
        }),
    [canJoin, isMyMinistry, ownDepartmentCode, rows, tab, ties],
  );

  const openArea = openCode ? rows.find((row) => row.code === openCode) ?? null : null;

  const { setCustomToggles, setCustomHeader } = usePageHeader();
  const accountViewItems = useMemo(
    () => [
      { key: "members", label: "Members", icon: Users },
      { key: "calendar", label: "Calendar", icon: CalendarDays },          { key: "accounts", label: "Account & Withdrawals", short: "Accounts", icon: Wallet },
    ],
    [],
  );

  // The sub-navs: for directory list (my/joinable), or for opened area (Members/Calendar/Accounts).
  useEffect(() => {
    if (openArea) {
      setCustomToggles(
        <SubNav
          label={`${openArea.label} views`}
          value={areaView}
          onChange={(next) => setAreaView(next as typeof areaView)}
          items={accountViewItems}
        />
      );
      return () => setCustomToggles(null);
    }
    setCustomToggles(
      <SubNav
        label="Ministry"
        value={tab}
        onChange={(next) => {
          setTab(next as AreaTab);
          setOpenCode(null);
          setAreaView("members");
        }}
        items={[
          { key: "mine", label: TAB_LABELS.mine },
          { key: "other", label: TAB_LABELS.other },
        ]}
      />
    );
    return () => setCustomToggles(null);
  }, [openArea, areaView, tab, accountViewItems, setCustomToggles]);

  // The shell names the area the member opened, or the map they are on.
  useEffect(() => {
    setCustomHeader(
      openArea
        ? { label: openArea.label, description: openArea.description }
        : {
            label: "Ministry",
            description:
              tab === "mine"
                ? "The areas you are part of or serve in."
                : "Other ministries and departments you can ask to join.",
          }
    );
    return () => setCustomHeader(null);
  }, [openArea, tab, setCustomHeader]);

  const [roll, setRoll] = useState<RollRow[]>([]);
  const [events, setEvents] = useState<AreaEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!openArea) return;
    const code = openArea.code;
    let alive = true;
    // The state writes ride a microtask, which is what keeps the effect's own
    // synchronous body from cascading the render (the same shape the desks
    // use for their own loads).
    void Promise.resolve().then(async () => {
      if (!alive) return;
      setLoading(true);
      const [membersData, eventsData] = await Promise.all([
        fetch(`${API_URL}/api/members/departments/${code}/members/`, { headers: authHeaders() })
          .then((res) => (res.ok ? res.json() : { members: [] }))
          .catch(() => ({ members: [] })),
        fetch(`${API_URL}/api/members/departments/${code}/events/`, { headers: authHeaders() })
          .then((res) => (res.ok ? res.json() : { events: [] }))
          .catch(() => ({ events: [] })),
      ]);
      if (!alive) return;
      setRoll(Array.isArray(membersData?.members) ? membersData.members : []);
      setEvents(Array.isArray(eventsData?.events) ? eventsData.events : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [openArea]);

  async function requestToJoin(code: string, label: string) {
    setJoining(code);
    try {
      const res = await fetch(`${API_URL}/api/members/department-join-requests/${code}/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "join", note: "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Your request could not be sent.");
      showAlert(
        "Request sent",
        `The ${label}'s leadership and the elders' desk have your request to join.`,
        "success",
        { toast: true, timer: 4500, showConfirmButton: false }
      );
    } catch (error) {
      showAlert("Could not send the request", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setJoining(null);
    }
  }

  // ── One area, read-only ────────────────────────────────────────────────
  if (openArea) {
    const leaders = openArea.holders.filter((holder) => holder.kind === "leader");
    const assistants = openArea.holders.filter((holder) => holder.kind === "assistant");
    return (
      <div className="flex-1 min-w-0 h-full w-full px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
        <div className="mx-auto max-w-4xl space-y-5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setOpenCode(null);
                setAreaView("members");
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-moss transition hover:text-bark"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Ministry
            </button>
          </div>

          {/* Section 1: Leadership */}
          {areaView === "members" && (
            <section className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
              <h2 className="flex items-center gap-2 text-sm font-bold text-bark">
                <UserRound className="h-4 w-4 text-ember" aria-hidden="true" />
                Leadership
              </h2>
              {leaders.length === 0 && assistants.length === 0 ? (
                <p className="mt-3 text-xs text-moss">No leadership is seated yet.</p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[...leaders, ...assistants].map((holder) => (
                    <div
                      key={`${holder.username}-${holder.role}-${holder.kind}`}
                      className="flex items-center gap-3 rounded-xl border border-sand-line bg-sand-linen px-3.5 py-3"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand-card text-xs font-bold uppercase text-ember">
                        {holder.name.slice(0, 1) || "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-bark">{holder.name}</p>
                        <p className="truncate text-[11px] text-moss">
                          {holder.role}
                          {holder.kind === "assistant" ? " · Assistant" : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Section 2: Members */}
          {areaView === "members" && (
            <section className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-bold text-bark">
                  <Users className="h-4 w-4 text-ember" aria-hidden="true" />
                  Members
                </h2>
                <span className="text-[11px] font-semibold text-moss">
                  {roll.length} {roll.length === 1 ? "person" : "people"}
                </span>
              </div>
              {loading && roll.length === 0 ? (
                <p className="mt-4 text-xs text-moss">Loading the roll…</p>
              ) : roll.length === 0 ? (
                <p className="mt-4 text-xs text-moss">Nobody is on this roll yet.</p>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {roll.map((member) => (
                    <span
                      key={member.id}
                      title={member.via ? `On the roll through ${member.via}` : undefined}
                      className="rounded-full border border-sand-line bg-sand-card px-3 py-1 text-xs font-semibold text-bark"
                    >
                      {member.name}
                      {member.via && <span className="ml-1 font-normal text-moss">· {member.via}</span>}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Section 3: Calendar */}
          {areaView === "calendar" && (
            <section className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
              <h2 className="flex items-center gap-2 text-sm font-bold text-bark">
                <CalendarDays className="h-4 w-4 text-ember" aria-hidden="true" />
                Calendar
              </h2>
              {loading && events.length === 0 ? (
                <p className="mt-4 text-xs text-moss">Loading the calendar…</p>
              ) : events.length === 0 ? (
                <p className="mt-4 text-xs text-moss">Nothing is on this area&apos;s calendar yet.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {events.map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border border-sand-line bg-sand-linen px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-bark">{event.title}</p>
                        <p className="text-[11px] text-moss">
                          {[event.time, event.location, event.lead].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-ember">{dayFirst(event.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Section 4: Account & Withdrawals */}
          {areaView === "accounts" && (
            <section className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold text-bark">
                    <Wallet className="h-4 w-4 text-ember" aria-hidden="true" />
                    Account &amp; Withdrawals
                  </h2>
                  <p className="mt-0.5 text-xs text-moss">
                    Fund balance, transaction ledger, and withdrawal requests.
                  </p>
                </div>
              </div>
              <div className="h-[540px]">
                <DepartmentAccountsPanel
                  department={openArea}
                  showInlineControls
                  search=""
                  typeFilter="all"
                  className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-sand-line bg-sand-linen/30 h-full"
                />
              </div>
            </section>
          )}

          <p className="flex items-start gap-2 rounded-xl border border-sand-line bg-sand-linen px-4 py-3 text-[11px] leading-5 text-moss">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-moss" aria-hidden="true" />
            This is the church&apos;s own record of {openArea.label}. To change anything, ask the
            area&apos;s leadership or the church office.
          </p>
        </div>
      </div>
    );
  }

  // ── The map: one card per area ─────────────────────────────────────────
  return (
    <div className="flex-1 min-w-0 h-full w-full px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
      {!openCode && visible.length === 0 ? (
        <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-sand-line px-5 py-12 text-center">
          <Users className="mx-auto h-9 w-9 text-moss" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-bark">
            {rows.length === 0 ? "Loading the church's areas…" : "Nothing here yet"}
          </p>
          <p className="mt-1 text-xs text-moss">
            {rows.length === 0
              ? "One moment."
              : tab === "mine"
              ? "Your department and ministries will appear here once the church office files them."
              : "There are no other ministries or departments available to join."}
          </p>
        </div>
      ) : (
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          {visible.map((area) => {
            const inArea = isMyMinistry(area);
            const leaders = area.holders.filter((holder) => holder.kind === "leader").map((h) => h.name);
            return (
              <div
                key={area.code}
                role="button"
                tabIndex={0}
                onClick={() => setOpenCode(area.code)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setOpenCode(area.code);
                  }
                }}
                className="flex cursor-pointer flex-col rounded-2xl border border-sand-line bg-white p-5 text-left shadow-sm transition hover:border-ember hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ember/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-bark">{area.label}</h3>
                  {inArea && (
                    <span className="shrink-0 rounded-full bg-sand-card px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ember">
                      You&apos;re in
                    </span>
                  )}
                </div>
                {area.description && <p className="mt-1.5 text-xs leading-5 text-moss">{area.description}</p>}
                <p className="mt-3 text-[11px] text-moss">
                  <span className="font-semibold text-bark">Leader:</span>{" "}
                  {leaders.length > 0 ? leaders.join(", ") : "not seated yet"}
                </p>
                <p className="text-[11px] text-moss">
                  {area.memberCount} on the roll · {area.eventCount} event{area.eventCount === 1 ? "" : "s"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-sand-line pt-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenCode(area.code);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember"
                  >
                    View area
                  </button>
                  {!inArea && canJoin(area.code) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void requestToJoin(area.code, area.label);
                      }}
                      disabled={joining === area.code}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
                    >
                      <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      {joining === area.code ? "Sending…" : "Request to join"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
