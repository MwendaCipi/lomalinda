/**
 * Where the app sits in the browser's back stack.
 *
 * The platform gives no way to delete a history entry, so "clear the history
 * when you go home" is really two steps: walk back to the entry the app opened
 * with, then rewrite *that* entry as the home screen. Home becomes the floor of
 * the stack, so the next Back leaves the app instead of replaying every page
 * tapped since.
 *
 * Every entry is stamped with its own index as it is created, which is what
 * makes the walk land in the right place even when several entries are crossed
 * at once — a long-press Back, or the collapse itself. The count cannot be
 * derived from the number of navigations alone: a Back leaves history entries
 * above us, and an out-of-range `history.go` is ignored rather than clamped.
 */

const APP_INDEX_KEY = "appIndex";
/** How long to wait for the walk to land before finishing the trip anyway. */
const FLOOR_TIMEOUT_MS = 1000;

type HistoryState = Record<string, unknown> | null;

/**
 * The page each live entry holds, keyed by its index.
 *
 * The platform lets a page ask where it stands but not what is down there, so
 * the answer is kept as the stack is stamped. It is what lets a tab recognise
 * that its page is already in the history below it — the platform cannot
 * delete an entry, so the way to keep Back short is to walk back to the one
 * that already holds the page rather than add a second copy above it.
 */
const entryPaths = new Map<number, string>();

/** The page an entry holds: path and query, the address a member recognises. */
function pathKey(url?: string | URL | null): string {
  const raw = url === null || url === undefined ? window.location.href : String(url);
  let path: string;
  let search = "";
  try {
    const resolved = new URL(raw, window.location.href);
    path = resolved.pathname;
    search = resolved.search;
  } catch {
    return raw;
  }
  // The app is exported with a trailing slash, so "/give" and "/give/" are
  // the same page to a member and have to compare as one — a tab's href has
  // no slash, while the address the router writes does.
  if (path.length > 1 && !path.endsWith("/")) path += "/";
  return path + search;
}

/** Forget the entries a push dropped from above the current one. */
function forgetEntriesAbove(index: number) {
  for (const known of [...entryPaths.keys()]) {
    if (known > index) entryPaths.delete(known);
  }
}

/** The index an entry already carries, or null when it predates the app. */
function stampedIndex(state: unknown): number | null {
  const value = (state as HistoryState)?.[APP_INDEX_KEY];
  return typeof value === "number" ? value : null;
}

/** The most recent entry below us that already holds this page, or -1. */
function earlierEntryFor(path: string): number {
  let at = -1;
  entryPaths.forEach((known, index) => {
    if (index < currentIndex && known === path && index > at) at = index;
  });
  return at;
}

/** Set while a revisit is folding the stack back to the entry that held the page. */
let pendingCollapse: { to: number } | null = null;
let collapseTimer: number | null = null;
/** Long enough for the router to finish painting the page it just pushed. */
const COLLAPSE_DELAY_MS = 250;

function cancelCollapse() {
  pendingCollapse = null;
  if (collapseTimer !== null) {
    window.clearTimeout(collapseTimer);
    collapseTimer = null;
  }
}

/**
 * Walk back to the entry that already holds the page we were just sent to.
 *
 * The push has happened by now — a navigation is never refused, only tidied
 * up — so the walk lands on an entry holding the very same address: the screen
 * does not change, and only the stack does. The entries above that one become
 * forward history, which Back never visits and the next push drops.
 */
function scheduleCollapse(to: number) {
  // The home walk owns the stack while it is under way.
  if (pendingHome) return;
  cancelCollapse();
  pendingCollapse = { to };
  collapseTimer = window.setTimeout(() => {
    collapseTimer = null;
    const pending = pendingCollapse;
    pendingCollapse = null;
    if (!pending || pendingHome) return;
    const delta = pending.to - currentIndex;
    if (delta < 0) window.history.go(delta);
  }, COLLAPSE_DELAY_MS);
}

/**
 * Surfaces that need to know the location moved.
 *
 * Next's client navigation writes the address bar through the history API
 * without a `popstate`, so anything reading `window.location` — the rail reads
 * its `?tab=` and `?dept=` — has to be told. That notification lives here
 * rather than in a second wrapper of its own: two patches of the same two
 * methods cannot both survive, because restoring one restores an older
 * `pushState` over the other and the stamping stops.
 */
const locationListeners = new Set<() => void>();

/** Subscribe to app navigations. Returns the unsubscribe. */
export function onAppLocationChange(listener: () => void) {
  locationListeners.add(listener);
  return () => {
    locationListeners.delete(listener);
  };
}

/**
 * Tell subscribers the location moved. The wrappers call this after the native
 * history method has written the URL, so desk chrome and its page content
 * change in the same render instead of briefly showing the previous desk.
 */
function notifyLocation() {
  locationListeners.forEach((listener) => listener());
}

/** Index of the entry we are on; 0 is the entry the app opened with. */
let currentIndex = 0;
let installed = false;
/** Set while a Home tap is walking back, run once the floor is reached. */
let pendingHome: (() => void) | null = null;
let pendingTimer: number | null = null;

function stamp(state: HistoryState, index: number) {
  const base = state && typeof state === "object" ? state : {};
  return { ...base, [APP_INDEX_KEY]: index };
}

function readIndex(state: unknown) {
  const value = (state as HistoryState)?.[APP_INDEX_KEY];
  return typeof value === "number" ? value : 0;
}

function finishPendingHome() {
  const run = pendingHome;
  pendingHome = null;
  if (pendingTimer !== null) {
    window.clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  run?.();
}

/**
 * Start counting this tab's app entries. Call once, from the app shell.
 *
 * The entry the app opened with becomes the floor (index 0). A push adds an
 * entry above it; a replace rewrites the current entry, so it does not move the
 * index. Nothing here changes what a page does — it only records where each one
 * sits.
 */
export function trackAppHistory() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const { pushState, replaceState } = window.history;
  entryPaths.set(0, pathKey(null));
  replaceState.call(window.history, stamp(window.history.state, 0), "", window.location.href);

  window.history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
    const target = pathKey(url);
    // A page the member has already walked past is still in the stack below
    // us: the push goes ahead as usual, then the stack folds back to the
    // entry that already holds it — so the history keeps one entry per page
    // and Back is one tap per place however the app is wandered.
    const earlier = earlierEntryFor(target);
    currentIndex += 1;
    const result = pushState.call(this, stamp(data as HistoryState, currentIndex), unused, url);
    // A push truncates whatever sat above us, so the stack is exactly these
    // entries from here up.
    entryPaths.set(currentIndex, target);
    forgetEntriesAbove(currentIndex);
    notifyLocation();
    if (earlier >= 0) scheduleCollapse(earlier);
    return result;
  };

  window.history.replaceState = function (data: unknown, unused: string, url?: string | URL | null) {
    // A replace rewrites the entry under us; it does not move it, so the
    // entry keeps the index it already carries. Stamping it from the counter
    // instead would misplace it whenever something rewrites an entry this
    // handler has not landed on yet — the router answers a popstate before
    // this one does, and a misstamp makes a walk back land on a page the
    // counter thinks is somewhere else entirely.
    const index = stampedIndex(this.state) ?? currentIndex;
    const result = replaceState.call(this, stamp(data as HistoryState, index), unused, url);
    entryPaths.set(index, pathKey(url));
    notifyLocation();
    return result;
  };

  window.addEventListener("popstate", (event) => {
    // An entry without our stamp predates the app, so we are at (or below) the
    // floor. Reading the index off the destination also covers a jump across
    // several entries in one go.
    currentIndex = readIndex(event.state);
    entryPaths.set(currentIndex, pathKey(null));
    // The member has taken the stack over; a queued walk would now be wrong.
    cancelCollapse();
    notifyLocation();
    if (currentIndex === 0 && pendingHome) {
      // One tick later: the router's own popstate handling starts first, and
      // the rewrite should follow it rather than race it.
      window.setTimeout(finishPendingHome, 0);
    }
  });
}

/**
 * Are we on the entry the app opened with — the floor of its back stack?
 *
 * A caller that would otherwise collapse on arrival asks this first: at the
 * floor there is nothing above to drop, so a Home that is already home does
 * not have to rewrite its own entry.
 */
export function atAppFloor() {
  return !installed || currentIndex === 0;
}

/**
 * Go home, dropping everything the app stacked above it.
 *
 * `onFloor` runs once the app's opening entry is the one in view — the caller
 * turns it into the home screen. When we are already at the floor there is
 * nothing to drop, so the callback runs straight away.
 */
export function collapseToHome(onFloor: () => void) {
  if (typeof window === "undefined" || !installed || currentIndex === 0) {
    onFloor();
    return;
  }
  // One walk at a time. A second caller — the dashboard collapsing itself on
  // arrival, while a Home tap's walk is already under way — would otherwise
  // step back a second time and overshoot the floor, landing on whatever
  // document the app was opened from.
  if (pendingHome) return;
  // A revisit's walk would land somewhere else once this one has moved the
  // stack, so it is dropped in favour of the longer one home.
  cancelCollapse();

  pendingHome = onFloor;
  if (pendingTimer !== null) window.clearTimeout(pendingTimer);
  // If the traversal never reports back — an entry from before the app, a
  // browser that coalesces it — still finish rather than leave a dead tap.
  pendingTimer = window.setTimeout(finishPendingHome, FLOOR_TIMEOUT_MS);
  window.history.go(-currentIndex);
}
