"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MoveLeft, LogOut, MoreVertical, UserPlus, Users } from "lucide-react";

import { usePageHeader } from "@/components/app-frame";
import { SubNav } from "@/components/sub-nav";
import {
  DEACONATE_ROLES,
  deaconateViews,
  DEPARTMENT_BLURBS,
  isStaffRole,
  MINISTRIES_AND_DEPARTMENTS_HEADING,
} from "@/config/navigation";
import { DeaconateManager } from "@/components/deaconate-manager";
import { showAlert } from "@/lib/alerts";
import { brand } from "@/lib/brand";
import { invalidateDepartments, useAllDepartments, useMyTies } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { DepartmentHub } from "@/components/department-hub";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

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
 * ministries/departments they may ask to join. Opening a card hands the
 * page to the department's own desk — the same one the dashboard and the
 * rail open — so a ministry reads the same whichever door it came through.
 */
export function MyAreas() {
  const rows = useAllDepartments();
  const ties = useMyTies();
  const { me } = useHeaderData();
  const sex = (me?.gender || "").trim().toLowerCase();
  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  // The office oversees every area — the two sex-only fellowships among
  // them — so those are only ever withheld from a member who may not ask
  // to join them.
  const staff = isStaffRole(roles);
  // The Treasury is a ministry of the church's own record now, so it arrives
  // with the directory rows — but it is held by office, never joined: the
  // rail offers its desk only to the treasurer and the admin, and this list
  // files it the same way rather than offering every member a door to knock
  // on with a join request.
  // Plainly computed rather than memoised: `roles` is rebuilt each render, so
  // a memo here would re-run every time anyway and buy nothing — this is a
  // two-element scan.
  const holdsTreasury = ["treasurer", "admin"].some((role) => roles.includes(role));

  const [tab, setTab] = useState<AreaTab>("mine");
  // The area open, and the view of it being read, are the address bar's own
  // (`?area=` and `?view=`) — the same way the console names its desks with
  // `?tab=`. The phone's back button, a reload and a shared link then land
  // on the page being read rather than the map it was opened from, which is
  // what used to render the old page under the same strip.
  const searchParams = useSearchParams();
  const openCode = searchParams.get("area");
  // Which of an opened area's views is being read (`?view=`).
  const openView = searchParams.get("view") ?? "members";
  const [joining, setJoining] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  /** Which card's actions popover is open — one at a time, the way the desks
      file their row menus. */
  const [openMenuCode, setOpenMenuCode] = useState<string | null>(null);
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

  /**
   * May the other half offer this area at all? Two gates stand between the map
   * and a row: the treasury's desk is held by office, so only the treasurer and
   * the admin are offered it (the same pair the rail gates it to), and the two
   * sex-only fellowships are withheld from the other sex.
   *
   * It is one predicate rather than a rule spelled into the list below because
   * the search asks the same question of every area (see `searchable`), and two
   * copies of a gate are two chances for them to disagree.
   */
  const mayOffer = useCallback(
    (area: (typeof rows)[number]) => {
      if (area.code === "treasury" && !holdsTreasury) return false;
      return staff || canJoin(area.code);
    },
    [canJoin, holdsTreasury, staff]
  );

  // What the member sees: first the areas they belong to or serve in, then
  // other areas open for a join request. Sex-only ministries stay hidden from
  // people who may not request them. One rule at every width — the two toggles
  // name the halves of this list on a phone as they do on a desk, so the strip
  // and the cards below it answer the same question everywhere.
  const visible = useMemo(
    () =>
      rows
        .filter((area) =>
          tab === "mine" ? isMyMinistry(area) : !isMyMinistry(area) && mayOffer(area)
        )
        .sort((a, b) => {
          if (tab === "mine") {
            const departmentA = a.code === ownDepartmentCode ? 0 : 1;
            const departmentB = b.code === ownDepartmentCode ? 0 : 1;
            if (departmentA !== departmentB) return departmentA - departmentB;
            const groupA = a.group === "ministry" ? 0 : 1;
            const groupB = b.group === "ministry" ? 0 : 1;
            return groupA - groupB || a.label.localeCompare(b.label);
          }
          // Other Ministries reads as one A–Z list, the way the rail files
          // it: nobody should step past every ministry before the first
          // department appears.
          return a.label.localeCompare(b.label);
        }),
    [isMyMinistry, mayOffer, ownDepartmentCode, rows, tab],
  );

  /**
   * The whole map the member may see, both halves in one list — the union of
   * the two toggles, and what the search runs against.
   *
   * Naming an area is a different way of asking for it than toggling for it, so
   * a search that reached only the half on show would answer "no area matches"
   * to a ministry the member can plainly see one tap away, and would make
   * finding an area depend on guessing which half the church filed it under.
   * The results lead with the member's own areas, their department at the head,
   * then A–Z, so a search for one word answers with what is theirs first
   * whichever half each match came from. The toggles' own lists keep their
   * groupings (above); this is only the order a mixed match set needs.
   */
  const searchable = useMemo(
    () =>
      rows
        .filter((area) => isMyMinistry(area) || mayOffer(area))
        .sort((a, b) => {
          const mineA = isMyMinistry(a) ? 0 : 1;
          const mineB = isMyMinistry(b) ? 0 : 1;
          if (mineA !== mineB) return mineA - mineB;
          const ownA = a.code === ownDepartmentCode ? 0 : 1;
          const ownB = b.code === ownDepartmentCode ? 0 : 1;
          return ownA - ownB || a.label.localeCompare(b.label);
        }),
    [isMyMinistry, mayOffer, ownDepartmentCode, rows]
  );

  // The map's own search: the cards are a short list, but the church keeps
  // growing areas and a phone scrolls them one at a time. It rides the shell's
  // header band beside the heading — the space the name leaves open on a phone
  // — and narrows the list to the areas whose name, line or leadership matches.
  //
  // It narrows `searchable`, not the toggled half: the box searches the whole
  // map the member may see, so an area is as findable from "My Ministry" as
  // from "Other Ministries". The toggle keeps naming the half being browsed —
  // it is the list beside the search, not a fence around it — and clearing the
  // box puts that half back exactly as it was.
  const [search, setSearch] = useState("");
  const searchNeedle = search.trim().toLowerCase();
  const matches = useMemo(
    () =>
      searchNeedle
        ? searchable.filter((area) =>
            `${area.label} ${area.description} ${area.holders.map((holder) => holder.name).join(" ")}`
              .toLowerCase()
              .includes(searchNeedle)
          )
        : visible,
    [searchNeedle, searchable, visible]
  );

  // The Treasury is filed in this list, but it is a desk of the console,
  // not an area of the map — it has no Members/Calendar/Accounts views of
  // its own, and drawing them under the treasury's name is what made the
  // card read as broken. A `?area=treasury` in the address bar (an old
  // link, a restored history step) therefore renders no area here; the
  // effect below walks it to the desk instead.
  const openArea = openCode && openCode !== "treasury" ? rows.find((row) => row.code === openCode) ?? null : null;

  /**
   * The deaconate reads as five pages: its team, the church's property
   * register, the duty rota, the ordinances calendar and the desk's funding.
   * The console's own strip names them on a wide screen, and the rail names
   * them on a desk — but neither is there in a hand, so the area desk draws
   * the same five toggles over itself. An officer of the desk reads that desk
   * here; a member who is not of it keeps the read-mostly view every area
   * gets, roll and ask-to-join included.
   */
  const holdsDeaconate = DEACONATE_ROLES.some((role) => roles.includes(role)) || ties.includes("deaconate");
  const opensDeaconateDesk = openArea?.code === "deaconate" && holdsDeaconate;
  const deaconateView = (deaconateViews.find((page) => page.view === openView)?.view ?? "members") as
    (typeof deaconateViews)[number]["view"];
  // The register, the rota and the funding are the console desk's own panels,
  // so they are read from it; the roll and the calendar are the ones this desk
  // already draws — the hub implements them, and the calendar is the real one
  // (the console's ordinances page is still a stub).
  const deaconateUsesHub = deaconateView === "members" || deaconateView === "calendar";

  const { setCustomToggles, setCustomHeader, setHeadingFirst, setHeaderRightAction, setPinnedDesk } =
    usePageHeader();
  const router = useRouter();

  // Reading the address bar: an area opens as a real step in the phone's
  // history (back returns to the map); moving between its views replaces the
  // entry instead, so a session of toggling leaves one step, not thirty,
  // while the bar still names the card on screen.
  const showMap = useCallback(() => router.replace("/my-areas"), [router]);
  const openAreaView = useCallback(
    // The Treasury card is a door, not a view: the registry names its
    // destination once — "Treasury opening the accounts tab of
    // Administration" — and the hand-placed card this row replaced did the
    // same, so pressing it walks straight to the desk and its own toggles
    // rather than opening an area the treasury does not have.
    //
    // Re-opening an area the member has already walked past folds back to
    // the entry that holds it (the history layer's job, not this page's):
    // one entry per area is what keeps Back one tap per place.
    (code: string) =>
      router.push(code === "treasury" ? "/administration/treasury" : `/my-areas?area=${code}&view=members`),
    [router]
  );
  // …and a `?area=treasury` already in the address bar goes to the desk
  // too: holders to the individual givings desk itself, anyone else back to the map
  // (the row is the treasurer's and the admin's to open). Replacing keeps
  // the map one step back, the way pressing the card is not.
  useEffect(() => {
    if (openCode !== "treasury") return;
    router.replace(holdsTreasury ? "/administration/treasury" : "/my-areas");
  }, [openCode, holdsTreasury, router]);
  // The sub-nav: the map's own two halves. An open area draws its own strip
  // — the desk's, exactly as the dashboard's ministry card draws it — so
  // touching the strip here as well would trade the desk's views for the
  // map's under them.
  useEffect(() => {
    if (openArea) return;
    setCustomToggles(
      <SubNav
        label="Ministry"
        value={tab}
        onChange={(next) => {
          // Switching the map swaps the address bar's open area for the
          // tab's, so the strip, the list and the URL agree.
          setTab(next as AreaTab);
          showMap();
        }}
        items={[
          { key: "mine", label: TAB_LABELS.mine },
          { key: "other", label: TAB_LABELS.other },
        ]}
      />
    );
    return () => setCustomToggles(null);
  }, [openArea, tab, setCustomToggles, showMap]);

  // The deaconate's desk draws the desk's own five pages, the same ones the
  // console's strip names. Moving between them replaces the entry, so a
  // session of toggling leaves one step and the address bar names the view on
  // screen — the way the map's own toggles behave.
  useEffect(() => {
    if (!opensDeaconateDesk) return;
    setCustomToggles(
      <SubNav
        label="Deaconate pages"
        value={deaconateView}
        onChange={(next) =>
          router.replace(`/my-areas?area=deaconate&view=${next}`, { scroll: false })
        }
        items={deaconateViews.map((page) => ({ key: page.view, label: page.label, short: page.short }))}
      />
    );
    return () => setCustomToggles(null);
  }, [opensDeaconateDesk, deaconateView, setCustomToggles, router]);

  // One card's actions popover at a time: a press anywhere outside the menu
  // closes it, the same way the desks' row menus behave.
  useEffect(() => {
    if (openMenuCode === null) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-area-actions]")) setOpenMenuCode(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuCode]);

  // A phone reads the map top-down: the place is named first, then the views
  // it answers to, so the map asks for its own heading-first order — and it
  // keeps that order when an area opens, where the desk's strip now draws
  // under the area's own name with the way back beside it (the same band the
  // map's cards sit under), rather than over the heading.
  useEffect(() => {
    setHeadingFirst(true);
    return () => setHeadingFirst(false);
  }, [setHeadingFirst]);

  // An open area is a desk of rows: the roll scrolls and the count and the
  // actions beside it stay at its foot, so on a phone the desk takes the whole
  // screen — the same screen the console's desks have by route. The map itself
  // keeps the page's own scroll, where its cards stack and the document moves.
  useEffect(() => {
    setPinnedDesk(Boolean(openArea));
    return () => setPinnedDesk(false);
  }, [openArea, setPinnedDesk]);

  // The map's search, on the heading's own row: it takes the space beside the
  // name rather than a row of its own beneath the strip, so the map on a phone
  // spends its height on the cards. An open area leaves the slot to the desk
  // under it — the hub sets its own search for whichever view is open, so this
  // only ever writes while the map itself is the page.
  useEffect(() => {
    if (openArea) return;
    setHeaderRightAction(
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search ministries and departments…"
        aria-label="Search ministries and departments"
        className="min-w-0 w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-64"
      />
    );
    return () => setHeaderRightAction(null);
  }, [openArea, search, setHeaderRightAction]);

  // One heading and one description for this page, whether the reader is on
  // the map or in an opened area: the name used to follow the toggle being
  // read (and become the area's own name and line), so the heading renamed
  // itself with every move. It is fixed now, the same text everywhere, and on
  // a phone the way back out of an area still rides above it.
  //
  // `openView` is a dependency because an opened area draws the desk that
  // writes this same band: this effect is an ancestor's, so it runs after the
  // desk's own and its text is the one that stands — a view change would move
  // the strip under the wrong heading otherwise.
  useEffect(() => {
    if (openArea) {
      if (opensDeaconateDesk && !deaconateUsesHub) {
        setCustomHeader({
          label: openArea.label,
          description: openArea.description || DEPARTMENT_BLURBS[openArea.code],
          leading: (
            <button
              type="button"
              onClick={showMap}
              aria-label="Back"
              className="-ml-1 inline-flex items-center justify-center rounded-xl p-1.5 text-moss transition hover:bg-sand hover:text-bark lg:hidden"
            >
              <MoveLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          ),
        });
      }
      return;
    }
    setCustomHeader({
      label: MINISTRIES_AND_DEPARTMENTS_HEADING.label,
      description: MINISTRIES_AND_DEPARTMENTS_HEADING.description,
    });
    return () => setCustomHeader(null);
  }, [openArea, opensDeaconateDesk, deaconateUsesHub, setCustomHeader, showMap]);

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

  /** A member stepping off a roll themselves — leaving needs nobody's
      permission, and the map files them back under Other Ministries at
      once (the ties are re-read the moment the roll changes). */
  async function leaveArea(area: (typeof rows)[number]) {
    const isMinistry = area.group === "ministry";
    const result = await showAlert(
      isMinistry ? "Leave ministry" : "Leave department",
      `Step off ${area.label}'s roll? Its leadership will see you among its members no longer.`,
      "question",
      { showCancelButton: true, confirmButtonText: "Leave", cancelButtonText: "Stay", confirmButtonColor: brand.ember }
    );
    if (!result.isConfirmed) return;
    setLeaving(area.code);
    try {
      const res = await fetch(`${API_URL}/api/members/departments/${area.code}/members/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "You could not step off this roll.");
      invalidateDepartments();
      showAlert("You have left", `You are off ${area.label}'s roll.`, "success", {
        toast: true,
        timer: 4500,
        showConfirmButton: false,
      });
    } catch (error) {
      showAlert("Could not leave", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setLeaving(null);
    }
  }

  // ── One area: the desk, whichever door opened it ─────────────────────
  // A ministry reads the same wherever it was opened — the dashboard's
  // card, a rail row, or a card on this map — so an open area hands the
  // page to the same desk those doors open instead of keeping a second,
  // thinner view of it here.
  if (openArea) {
    // No padding on a phone: the desk's own card is the screen there. It
    // carries its own inset on the wider widths, where this wrapper's padding
    // is what frames it.
    return (
      <div className="flex h-full min-w-0 w-full flex-col sm:px-8 sm:py-4 lg:px-10 lg:py-5">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col">
          <div className="min-h-0 w-full flex-1">
            {opensDeaconateDesk ? (
              deaconateUsesHub ? (
                <DepartmentHub
                  key={`deaconate-${deaconateView}`}
                  initialDept="deaconate"
                  initialTab={deaconateView}
                  embedded
                  onBack={showMap}
                />
              ) : (
                <DeaconateManager initialTab={deaconateView} embedded onBack={showMap} />
              )
            ) : (
              <DepartmentHub
                key={openArea.code}
                initialDept={openArea.code}
                // The address bar names the view a desk's strip pressed — the
                // eldership's Event Calendar and Baptismal class are two — so
                // the desk opens on the view the link named rather than always
                // on its roll.
                initialTab={
                  openView === "calendar"
                    ? "calendar"
                    : openView === "baptismal-class"
                      ? "baptismal-class"
                      : "members"
                }
                onBack={showMap}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

// ── The map: one card per area ─────────────────────────────────────────
  return (
    <div className="flex-1 min-w-0 h-full w-full px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
      {!openCode && matches.length === 0 ? (
        <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-sand-line px-5 py-12 text-center">
          <Users className="mx-auto h-9 w-9 text-moss" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-bark">
            {rows.length === 0
              ? "Loading the church's ministries and departments…"
              : searchNeedle
              ? "No area matches that search"
              : "Nothing here yet"}
          </p>
          <p className="mt-1 text-xs text-moss">
            {rows.length === 0
              ? "One moment."
              : searchNeedle
              ? "Try another name, or clear the search to read the whole map."
              : tab === "mine"
              ? "Your department and ministries will appear here once the church office files them."
              : "There are no other ministries or departments available to join."}
          </p>
        </div>
      ) : (
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          {matches.map((area) => {
            const inArea = isMyMinistry(area);
            const leaders = area.holders.filter((holder) => holder.kind === "leader").map((h) => h.name);
            return (
              <div
                key={area.code}
                role="button"
                tabIndex={0}
                onClick={() => openAreaView(area.code)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openAreaView(area.code);
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
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand-line pt-3">
                  {/* The card's own actions sit in one popover: opening the
                      area, the ask to join, and leaving it. On a phone the ask
                      belongs here with them — the row has no room for a button
                      beside Actions — and the wider screens read the same ask
                      as the foot of the area's own Members page, where the roll
                      it is about is on screen. The desks file their row
                      actions the same way. */}
                  <div
                    className="relative ml-auto"
                    data-area-actions
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={openMenuCode === area.code}
                      aria-label={`Actions for ${area.label}`}
                      onClick={() => setOpenMenuCode((open) => (open === area.code ? null : area.code))}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember"
                    >
                      <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                      Actions
                    </button>
                    {openMenuCode === area.code && (
                      <div
                        role="menu"
                        className="absolute right-0 z-50 mt-2 w-52 rounded-2xl border border-sand-line bg-white py-2 shadow-xl"
                      >
                        {!inArea && canJoin(area.code) && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuCode(null);
                              void requestToJoin(area.code, area.label);
                            }}
                            disabled={joining === area.code}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-bark transition hover:bg-sand disabled:opacity-60 sm:hidden"
                          >
                            <UserPlus className="h-3.5 w-3.5 text-ember" aria-hidden="true" />
                            {joining === area.code ? "Sending…" : "Request to join"}
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenMenuCode(null);
                            openAreaView(area.code);
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-bark transition hover:bg-sand"
                        >
                          <Users className="h-3.5 w-3.5 text-ember" aria-hidden="true" />
                          {area.group === "ministry" ? "View ministry" : "View department"}
                        </button>
                        {inArea && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuCode(null);
                              void leaveArea(area);
                            }}
                            disabled={leaving === area.code}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-moss transition hover:bg-sand hover:text-ember disabled:opacity-60"
                          >
                            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                            {leaving === area.code
                              ? "Leaving…"
                              : area.group === "ministry"
                              ? "Leave ministry"
                              : "Leave department"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
