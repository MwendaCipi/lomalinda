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
 * Tell subscribers the location moved — a tick later, because a wrapper runs
 * *before* the URL is written and they read `window.location`.
 */
function notifyLocation() {
  window.setTimeout(() => {
    locationListeners.forEach((listener) => listener());
  }, 0);
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
  replaceState.call(window.history, stamp(window.history.state, 0), "", window.location.href);

  window.history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
    currentIndex += 1;
    const result = pushState.call(this, stamp(data as HistoryState, currentIndex), unused, url);
    notifyLocation();
    return result;
  };

  window.history.replaceState = function (data: unknown, unused: string, url?: string | URL | null) {
    const result = replaceState.call(this, stamp(data as HistoryState, currentIndex), unused, url);
    notifyLocation();
    return result;
  };

  window.addEventListener("popstate", (event) => {
    // An entry without our stamp predates the app, so we are at (or below) the
    // floor. Reading the index off the destination also covers a jump across
    // several entries in one go.
    currentIndex = readIndex(event.state);
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

  pendingHome = onFloor;
  if (pendingTimer !== null) window.clearTimeout(pendingTimer);
  // If the traversal never reports back — an entry from before the app, a
  // browser that coalesces it — still finish rather than leave a dead tap.
  pendingTimer = window.setTimeout(finishPendingHome, FLOOR_TIMEOUT_MS);
  window.history.go(-currentIndex);
}
