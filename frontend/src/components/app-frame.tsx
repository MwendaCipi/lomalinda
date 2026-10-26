"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { NavRail } from "./nav-rail";
import { AppTopBar } from "./app-topbar";
import { MobileTabBar } from "./mobile-tab-bar";
import { ConnectivityToast } from "./toast";
import { SectionNav } from "./sub-nav";
import { pageHeaderFor, railFor, type RailRow } from "@/config/navigation";
import { normalizePath } from "@/lib/paths";
import { isMarketingPage } from "@/lib/route-visibility";
import { useAllDepartments, useMyDepartments, useMyTies } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { useRailHere } from "@/hooks/use-rail-location";

type PageHeaderHeading = {
  label: string;
  /**
   * The name the heading prints in place of `label`, where the page's own
   * label is only a toggle inside its section (Giving, inside Stewardship).
   */
  heading?: string;
  description?: string;
  /**
   * A node the heading band carries above the heading itself — the way back
   * out of an opened area, which on a phone is read before the name it
   * returns from rather than after it.
   */
  leading?: React.ReactNode;
};

type PageHeaderContextType = {
  setHeaderRightAction: (node: React.ReactNode) => void;
  /**
   * The strip of views a page draws under its heading. `usePageHeader` binds
   * every caller to a token of its own, so the shell can tell a page's clear
   * from a page that has already been replaced: React may run a leaving page's
   * cleanup *after* the arriving page's effect has drawn its own strip, and an
   * unclaimed clear then wiped a strip that was already correct — the treasury
   * lost its whole row of views when its rail row was opened from another desk.
   * The field is filled in by `usePageHeader`, never by the shell itself.
   */
  setCustomToggles: (node: React.ReactNode) => void;
  claimStrip: (token: object, node: React.ReactNode) => void;
  /**
   * An action that rides the right edge of the row of toggles, on a wide
   * screen — the place a page puts a control that belongs with its views
   * rather than with its heading (the deaconate's second Add Member, say).
   * It is a convenience beside the control the page already carries, never
   * the only way to reach the action: a phone never sees it.
   */
  setTogglesRightAction: (node: React.ReactNode) => void;
  /**
   * Let a page name itself, overriding the heading its rail row would give it.
   * A desk that answers several views under one route (the treasury's six, say)
   * uses this so the heading follows the view the visitor chose rather than
   * staying fixed on whichever row led here — otherwise pressing "Individual
   * Givings" leaves the page titled after the ledger it sits in.
   */
  setCustomHeader: (heading: PageHeaderHeading | null) => void;
  /**
   * A page whose own name leads on a phone: the heading band rides *above* the
   * row of toggles instead of under it, so the place is named before its views
   * are offered. The shell's default is the other order — the strip names the
   * place and the heading answers to it, which keeps the page's height for the
   * page — so this is asked for a page at a time, never imposed on all of them.
   */
  setHeadingFirst: (on: boolean) => void;
  /**
   * A page that is a desk of rows on a phone — the rows scroll, and the count
   * and the actions beside it stay at the foot — asks for the whole screen,
   * the way the pages that are pinned by route have it. It is asked for by a
   * page whose *state* is the desk (the ministry map's opened area, say),
   * where no route of its own exists to pin; the map itself keeps the page's
   * own scroll.
   */
  setPinnedDesk: (on: boolean) => void;
  /**
   * Whether the toggles strip should step aside / hide when the reader scrolls,
   * giving the height back to the scrolling page content while heading and search stay fixed.
   */
  setTogglesHideOnScroll: (on: boolean) => void;
};

const noop = () => {};

const PageHeaderContext = createContext<PageHeaderContextType>({
  setHeaderRightAction: noop,
  setCustomToggles: noop,
  claimStrip: noop,
  setTogglesRightAction: () => {},
  setCustomHeader: () => {},
  setHeadingFirst: () => {},
  setPinnedDesk: () => {},
  setTogglesHideOnScroll: () => {},
});

export function usePageHeader(): PageHeaderContextType {
  const context = useContext(PageHeaderContext);
  // One token per page that asks for the slot: its clear only counts while it
  // still holds it (see `claimStrip`).
  const tokenRef = useRef<object | null>(null);
  if (tokenRef.current === null) tokenRef.current = {};
  const token = tokenRef.current;
  return useMemo(
    () => ({ ...context, setCustomToggles: (node: React.ReactNode) => context.claimStrip(token, node) }),
    [context, token]
  );
}

export type ScrollMode = "panel" | "pinned";

export function scrollModeForPath(pathname: string): ScrollMode {
  if (pathname.startsWith("/administration")) return "pinned";
  if (pathname === "/member/giving") return "pinned";
  if (pathname === "/support/in-kind") return "pinned";
  // Chat is app-like at every width: the viewport holds still and the rooms
  // list and the thread scroll inside it, so the compose box can sit at the
  // foot of the thread instead of riding the page's own scroll.
  if (pathname === "/chat") return "pinned";
  // My Givings is the same shape as the giving page it records: the filters
  // and the actions row stay put and the timeline scrolls between them, so
  // the footer can sit flush against the phone's tab bar.
  if (pathname === "/member/givings") return "pinned";
  // The church calendar holds still and lets its own list scroll inside, so the
  // toggles and heading stay put while the rows move under them.
  if (pathname === "/calendar") return "pinned";
  return "panel";
}

const LOCKED_PREFIXES = ["/complete-profile"];

/**
 * The sections whose pages name themselves on a phone, the way Materials and
 * the Ministry map always have: the heading rides *above* the strip, so a
 * reader is told where they are before the views are offered.
 *
 * Fellowship and Stewardship are the two sections a member lives in all week,
 * and on a narrow screen they used to give their reader only the strip — a row
 * of chips whose meaning depends on already knowing which section you are in.
 * A wide screen has always named the place above the strip, so this is the
 * phone catching up to the same order rather than a second idea of it. The
 * names come from the registry (`pageHeaderFor`) exactly as the wide screen's
 * do, so a page is named the same way at every width.
 */
const HEADING_FIRST_SECTIONS = new Set(["Fellowship", "Stewardship"]);

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = normalizePath(usePathname());
  const { me, hasToken } = useHeaderData();

  /**
   * The places whose strip steps aside while the page is read by scrolling.
   *
   * Stewardship is read that way — the giving page, the member's own record of
   * it, the drives, the budget and the published figures — so its strip gives
   * the screen back on the way down and returns on any upward move, the way the
   * phone's own bar does (see `MobileTabBar`); the difference is that this band
   * hands its height to the page rather than floating over it, which is why it
   * answers only a page that scrolls inside itself (see the effect below) — on
   * a phone the drives, budget, balances and reports ride the window instead,
   * and their strip leaves the screen with the page it belongs to. The desks
   * that switch a table between views keep their strip: there the toggles *are*
   * the page, and the calendar asks for the same by holding its own list still.
   */
  const [togglesHideOnScrollAsked, setTogglesHideOnScroll] = useState(false);

  const togglesHideOnScroll =
    togglesHideOnScrollAsked ||
    pathname === "/member/giving" ||
    pathname === "/member/givings" ||
    pathname === "/support/campaigns" ||
    pathname === "/support/budget" ||
    pathname === "/support/financial" ||
    pathname === "/support/reports" ||
    pathname === "/support/property" ||
    pathname === "/administration/treasury" ||
    pathname === "/administration/fund-drives";

  const [headerRightAction, setHeaderRightAction] = useState<React.ReactNode>(null);
  const [customToggles, setCustomTogglesState] = useState<React.ReactNode>(null);
  // Which page drew the strip now on screen. A page's clear only counts while
  // it still holds the slot, so a page that has already been replaced cannot
  // wipe the strip its successor drew (see `claimStrip`).
  const stripOwnerRef = useRef<object | null>(null);
  const claimStrip = useCallback((token: object, node: React.ReactNode) => {
    if (node === null && stripOwnerRef.current !== token) return;
    stripOwnerRef.current = node === null ? null : token;
    setCustomTogglesState(node);
  }, []);
  const [togglesRightAction, setTogglesRightAction] = useState<React.ReactNode>(null);
  const [customHeader, setCustomHeader] = useState<PageHeaderHeading | null>(null);
  const [headingFirstAsked, setHeadingFirst] = useState(false);
  // A page whose own state is a desk asks for the screen the pinned routes
  // have (see `setPinnedDesk`); it is cleared with the rest of the chrome the
  // moment the route changes.
  const [pinnedDesk, setPinnedDesk] = useState(false);
  // The screen the shell lays out: the route's own mode, or the one a page
  // asks for while it is the desk on screen (see `setPinnedDesk`).
  const mode: ScrollMode = pinnedDesk ? "pinned" : scrollModeForPath(pathname);
  // Whether the strip is currently out of sight because the reader is moving
  // down the page (see the scroll effect below).
  const [togglesScrolledDown, setTogglesScrolledDown] = useState(false);
  // The band's own element, and when it last moved: a scroll *inside* the band
  // (its content is taller than the row while the row shrinks) is the band
  // collapsing, not the reader going anywhere, and the browser's own
  // compensation for the height it gives back is not the reader either —
  // answering either would set the scroll and the strip chasing each other.
  const togglesBandRef = useRef<HTMLDivElement | null>(null);
  const togglesMovedAt = useRef(0);
  const togglesScrolledRef = useRef(false);

  // The setters never change identity, so the context value must not either.
  // A fresh object on every shell render re-renders every page that injects a
  // header control or a toggle strip — and a page whose effect depends on a
  // value it rebuilds each render (a filtered array, say) then loops: effect →
  // `setHeaderRightAction` → shell re-render → new context → page re-render →
  // effect. One stable value breaks the loop for every desk at once.
  const pageHeaderSlots = useMemo(
    () => ({
      setHeaderRightAction,
      setCustomToggles: noop,
      claimStrip,
      setTogglesRightAction,
      setCustomHeader,
      setHeadingFirst,
      setPinnedDesk,
      setTogglesHideOnScroll,
    }),
    [setHeaderRightAction, claimStrip, setTogglesRightAction, setCustomHeader, setHeadingFirst, setPinnedDesk, setTogglesHideOnScroll]
  );

  // A page's header chrome belongs to the page it was drawn for, so it is
  // cleared the moment that page changes — but the clearing has to land
  // *before* the new page's effects register their own. Left to an effect it
  // ran after the child's (a child's effects fire first), wiping the strip the
  // page had just set; that is how a page's own toggles kept losing to the
  // section's and two strips seemed to take turns. Adjusting the state during
  // render settles it in the same pass, so the page always has the last word.
  //
  // Only the pathname is a page. The query is not: on a client navigation it
  // settles a render after the pathname, so keying the reset on it ran a second
  // time *after* the arriving page had drawn its heading — the treasury lost
  // its name on a phone every time it was opened from another treasury surface
  // (Accounts → Givings), because the desks that share `/administration` read
  // the URL as their page and the ledger's `?mode=` arrived last. A desk that
  // changes under one pathname is the page's own business: it registers its
  // chrome from an effect keyed on that state and clears it on unmount.
  const [pathAtLastReset, setPathAtLastReset] = useState(pathname);

  // The scroll the band answers belongs to the page it was read on, so a new
  // page starts with its strip in sight. (The ref itself is written here, never
  // while rendering — the state above is what the band draws.)
  useEffect(() => {
    togglesScrolledRef.current = false;
    togglesMovedAt.current = 0;
  }, [pathname]);

  /** Show or hide the strip, and remember when it last moved — nothing the
      browser says in the next few hundred milliseconds is the reader. */
  const setTogglesHidden = useCallback((hidden: boolean) => {
    if (togglesScrolledRef.current === hidden) return;
    togglesScrolledRef.current = hidden;
    togglesMovedAt.current = Date.now();
    setTogglesScrolledDown(hidden);
  }, []);

  // Whatever scrolls, scrolls: a pinned page moves its own inner list, a phone's
  // panel page moves the window, and a desk's table moves the panel card. The
  // event names which, so one listener reads them all — registered in the
  // capture phase, because a scroll event does not bubble.
  useEffect(() => {
    if (!togglesHideOnScroll) return;
    let lastTarget: EventTarget | null = null;
    let lastY = 0;
    let lastBoxH = -1;
    const onScroll = (event: Event) => {
      // The band's own box scrolls as it collapses — its content is taller than
      // the row while the row shrinks — and that is the band moving, not the
      // reader. It leaves the reading position untouched.
      if (event.target instanceof Node && togglesBandRef.current?.contains(event.target)) return;
      // Only a scroller *inside* the page counts. When the window is what
      // moves, the strip is riding away with the page already — it is the
      // page's first row, not chrome pinned over it — and taking its height
      // away under a moving page would only shift what the reader is reading.
      const element = event.target instanceof HTMLElement ? event.target : null;
      let y = 0;
      let boxH = 0;
      if (element && element !== document.documentElement && element !== document.body) {
        y = element.scrollTop;
        boxH = element.clientHeight;
      } else {
        y = window.scrollY;
        boxH = window.innerHeight;
      }
      // A different scroller takes over: the move is measured from here.
      if (event.target !== lastTarget) {
        lastTarget = event.target;
        lastY = y;
        lastBoxH = boxH;
        return;
      }
      // Hiding the band — or giving it back — resizes the scroller, and the
      // browser answers with scrolls of its own: a clamp of an out-of-range
      // position, an anchoring adjustment as rows shift. A changed box says
      // that is what moved, not the reader — so the new position is where
      // the reader's own next move is measured from, and this move is not
      // answered.
      if (boxH !== lastBoxH) {
        lastBoxH = boxH;
        lastY = y;
        return;
      }
      const moved = y - lastY;
      lastY = y;
      // The browser keeps the page where it was reading while the band gives
      // its height back; those moves are not answered, but the position above
      // is left current so the reader's own next move is measured from it.
      if (Date.now() - togglesMovedAt.current < 400) return;
      // A few pixels of jitter is not a scroll: without this the strip
      // flickers — and a browser clamp that parks the page just under the
      // top reads as no motion at all, so it must not open the band again.
      if (Math.abs(moved) < 8) return;
      // Near the top the strip is shown, whatever the direction — the one
      // exception to the reader's own hand.
      if (y <= 64) {
        setTogglesHidden(false);
        return;
      }
      setTogglesHidden(moved > 0);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [togglesHideOnScroll, setTogglesHidden]);

  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  const myDepartments = useMyDepartments();
  const myTies = useMyTies();
  const departments = useAllDepartments();
  const entries = railFor(
    { roles, departmentCodes: myDepartments, tieCodes: myTies, sex: me?.gender },
    departments
  );
  const here = useRailHere(pathname, entries);
  // A page that replaces another must not inherit its controls: reset the
  // injected header chrome the moment the pathnames differ, so a desk's search
  // and filters cannot remain on screen while the next page loads its own.
  //
  // The strip itself is deliberately *not* cleared here. A page owns that
  // slot, clears it when it unmounts, and the shell cannot tell whose strip it
  // is holding: clearing here raced the page that had just replaced it and
  // wiped it, leaving the treasury with no toggles at all after a tap on its
  // rail row. Header chrome follows the same rule for a query: a desk that
  // changes tab under one pathname registers and clears its own.
  if (pathname !== pathAtLastReset) {
    setPathAtLastReset(pathname);
    setHeaderRightAction(null);
    setTogglesRightAction(null);
    setCustomHeader(null);
    setHeadingFirst(false);
    setPinnedDesk(false);
    setTogglesHideOnScroll(false);
    setTogglesScrolledDown(false);
  }

  const section = here.group ? entries.find((entry) => entry.label === here.group) ?? null : null;
  // The row that is "here", whether it sits inside a section's list (the
  // clerk's pages) or stands on its own (a department's desk, whose rail row
  // is top-level). Reading both is what lets a department's desk show its own
  // heading instead of falling back to the console's.
  const railRows: RailRow[] = entries.flatMap((entry) =>
    "items" in entry && entry.items ? entry.items : "href" in entry && entry.href ? [entry as RailRow] : []
  );
  const hereItem = railRows.find((item) => item.href === here.href) ?? null;
  // A page that sits inside a section (its toggles are the strip) takes its
  // heading from the *section* entry — not the active toggle — so pressing a
  // different toggle never changes the heading. A standalone rail row (a
  // department's desk) still reads its own entry; a page with no rail entry
  // falls back to the static registry.
  const pageHeader = section && ("description" in section || "dept" in section)
    ? { label: section.label, heading: (section as RailRow).heading, description: (section as RailRow).description }
    : hereItem && (hereItem.description || hereItem.dept)
      ? { label: hereItem.label, heading: hereItem.heading, description: hereItem.description }
      : pageHeaderFor(pathname);
  // A page that names itself wins over the rail row that led here.
  const named = customHeader ?? pageHeader;
  // The heading prints the page's own name, or the section's where its row
  // carries only a view of it: the Giving page sits under a Stewardship
  // heading with Giving as the toggle beneath, so the two never disagree about
  // which place the reader is in.
  const header: PageHeaderHeading | null = named
    ? { ...named, label: named.heading ?? named.label }
    : null;
  // Whether the heading leads the strip on *this* page: a page that asks for
  // it, or a page of a section that always has (Materials and Ministry ask the
  // same way, one page at a time).
  const headingFirst =
    headingFirstAsked ||
    (section !== null && HEADING_FIRST_SECTIONS.has(section.label));
  // A desk that keeps its own strip (`ownStrip`) draws it through
  // `setCustomToggles`; the shell must not turn its `items` into a second,
  // older navigation that shows first and is then replaced.
  const ownsItsStrip = section !== null && "ownStrip" in section && section.ownStrip === true;
  const sectionPages = (section && !ownsItsStrip && "items" in section && section.items ? section.items : [])
    .filter((item) => Boolean(item.href))
    .map((item) => ({
      key: item.href as string,
      href: item.href as string,
      // The strip may name a page differently from its rail row when a
      // page carries a stripLabel of its own.
      label: item.stripLabel ?? item.label,
      short: item.short,
      icon: item.icon,
      help: item.label,
    }));

  const locked = LOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const showRail = hasToken && !isMarketingPage(pathname) && !locked;

  if (!showRail) return <>{children}</>;

  return (
    <PageHeaderContext.Provider value={pageHeaderSlots}>
      <div
        // The mobile tab bar only lives on the dashboard; on any other page,
        // it is not rendered or shown, so the shell keeps pb-0. On the dashboard,
        // pinned mode uses calc(3.5rem+env(safe-area-inset-bottom)) and panel mode keeps pb-24.
        className={`app-shell flex min-h-0 flex-1 flex-col md:h-full md:overflow-hidden md:pb-0 ${
          pathname === "/dashboard"
            ? mode === "pinned"
              ? "pb-[calc(3.5rem+env(safe-area-inset-bottom))]"
              : "pb-24"
            : "pb-0"
        }`}
        data-scroll-mode={mode}
        data-has-mobile-nav={pathname === "/dashboard"}
      >
        <div className="app-shell-body flex min-h-0 flex-1">
          <NavRail />
          <div className="app-panel-column">
            <AppTopBar />
            <div className="app-content">
              {(header || headerRightAction) && (
                // A phone spends its height on the page, not on the chrome: the
                // heading and its description ride the wider screens only, and a
                // header with nothing left on a phone (no controls) steps out
                // entirely. On a phone this band drops below the row of toggles —
                // the strip names the place, and the search answers to it — and
                // the wider screens keep the heading first, controls to its right.
                // A page that asks to be named first (`setHeadingFirst`) swaps
                // those two on the phone: heading, then its own strip beneath.
                //
                // On a wide screen the band is one row: the name, its control
                // to the right. On a phone a page that names itself first reads
                // top-down instead — the way back and the name on the first
                // row, the page's own controls (its search and filters) on the
                // row under it, and the strip below both — so the controls
                // never squeeze in beside the name they answer to. Where the
                // strip names the page, the heading is left to the wider
                // screens and the row holds the page's control alone, exactly
                // as it always did.
                <div
                  className={`${headingFirst ? "order-1" : "order-2"} sm:order-none shrink-0 bg-white px-3 py-2.5 sm:px-5 sm:py-3.5 border-b border-sand-line flex ${
                    headingFirst
                      ? "flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                      : "items-center justify-between gap-3"
                  } ${headerRightAction || headingFirst ? "" : "hidden sm:flex"}`}
                >
                  {header && (
                    <div className={`min-w-0 ${headingFirst ? "" : "hidden sm:block"}`}>
                      {/* Before the name on a phone: the way back out of an
                          opened area, read on the same row and before the
                          place it returns from. The node carries its own
                          breakpoints. */}
                      <div className="flex items-center gap-2">
                        {header.leading}
                        <h1 className="text-xl font-semibold tracking-tight text-bark sm:text-2xl">{header.label}</h1>
                      </div>
                      {header.description && (
                        <p className="mt-0.5 hidden text-xs text-moss sm:block sm:text-sm">{header.description}</p>
                      )}
                    </div>
                  )}
                  {headerRightAction && (
                    <div
                      className={
                        // Its own full-width row under the name on a phone;
                        // beside the name on the wider screens, at the right
                        // edge of the same row.
                        headingFirst
                          ? "flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1 sm:justify-end"
                          : "flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto"
                      }
                    >
                      {headerRightAction}
                    </div>
                  )}
                </div>
              )}
              {(customToggles || sectionPages.length > 1) && (
                // The band gives its height back when it hides: a grid row that
                // runs from 1fr to 0fr, with the strip clipped inside it, so the
                // page keeps the whole screen while it is read and gets its
                // toggles back the moment the reader turns upward.
                <div
                  ref={togglesBandRef}
                  inert={togglesHideOnScroll && togglesScrolledDown}
                  className={`${headingFirst ? "order-2" : "order-1"} sm:order-none grid shrink-0 transition-[grid-template-rows] duration-300 ease-out ${
                    togglesHideOnScroll && togglesScrolledDown ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
                  }`}
                >
                  <div className="flex min-h-0 items-center gap-3 overflow-hidden border-b border-sand-line bg-white px-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      {customToggles ? (
                        <div className="pt-2">{customToggles}</div>
                      ) : (
                        <SectionNav
                          label={`${section?.label ?? ""} pages`}
                          activeHref={here.href}
                          items={sectionPages}
                        />
                      )}
                    </div>
                    {togglesRightAction && (
                      <div className="hidden shrink-0 items-center lg:flex">{togglesRightAction}</div>
                    )}
                  </div>
                </div>
              )}
              <div className="app-panel order-3 sm:order-none">{children}</div>
            </div>
          </div>
        </div>
      </div>
      {pathname === "/dashboard" && <MobileTabBar />}
      <ConnectivityToast />
      <ConnectivityToast />
    </PageHeaderContext.Provider>
  );
}
