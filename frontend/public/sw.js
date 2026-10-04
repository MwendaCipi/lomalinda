/* The cache name is the app's asset generation, not just a label.

   The page copies below are whole documents, and a document carries the app's
   shell — the rail, the identity bar, the phone's tab bar, the sign-in gate.
   A member whose app was installed under an older generation keeps painting
   that older shell for the routes we hold copies of (everything except
   `/dashboard/`, which was never listed here) until this name moves: their own
   build looks current on the dashboard and stale everywhere else. So bump the
   version whenever the chrome changes, not only when an icon does.

   v11 — the phone's tab bar carries its section's pages and the leaders' door
   holds the leadership rows, and the dashboard reads the congregation's pulse
   instead of a grid of tiles: chrome, so every installed app must take the new
   shell rather than keep painting the old one from its cache.

   v12 — every tab navigates now: a section's pages are the chip strip on the
   page itself at every width, the phone's menu sheet is the leaders' door
   only, and the Materials shelves carry the children's divisions directly.

   v13 — the door is gone: the Admin tab is ordinary navigation to the
   console, whose overview cards carry the desks. No menu sheet remains.

   v14 — prayer and visitation are separate desks under Requests; the
   combined page is a redirect.

   v15 — no Home tab on the phone (the topbar's mark is the way home), the
   join button sits right in the announcement rail, and Moments is a real
   gallery page in Fellowship.

   v16 — the announcements feed is compact by default with no density
   toggle, and its photo previews shrink so a card's actions stay on screen.

   v17 — the rail grows two headings (Ministries, Departments) with each area
   as its own row, the Leadership desk returns shared by elders and clerks,
   and the two desks are decoupled. Chrome changed, so installed apps must
   take the new shell.

   v18 — the leadership desk is rebuilt: the directory reads Leader / First
   Assistant / Second Assistant in fixed columns, rows keep one Edit
   Leadership button (no actions popover, checkboxes or Communicate), and the
   leadership modal appoints by seat — search under Leader or under Assistant
   — while custom roles move to a Create role form. Chrome changed, so
   installed apps must take the new shell.

   v19 — the leadership modal appoints by position: one Leader (search bar
   beneath with a Set leader button) and up to two Assistants (their own
   search bar with a Set assistant button), elders keep their three named
   offices, and areas carry only Leader and Assistant roles. Chrome changed,
   so installed apps must take the new shell.

   v20 — the rail files the church's areas under one heading: Ministries and
   Departments rows join as one Ministry list beside the desks' Leadership.
   Chrome changed, so installed apps must take the new shell.

   v21 — the rail's first two headings merge: Dashboard rows join the My
   church list, leaving Leadership and Ministry as the other headings.
   Chrome changed, so installed apps must take the new shell.

   v22 — announcement photos in the feed are a step taller again (md), a
   little over fifty pixels more than the compact height. Chrome changed,
   so installed apps must take the new shell.

   v23 — the Elders' Desk submenu carries Board and Business Meetings as two
   rows (no Meetings middleman), and User Management's header reads one
   record row: tabs left, search right. Chrome changed, so installed apps
   must take the new shell.

   v24 — the rail's headings settle: the desks and the ministries read as
   one Service list, with the departments a Departments list of their own.
   Chrome changed, so installed apps must take the new shell.

   v25 — announcement photos take another thirty pixels (md now 238px).

   v26 — the Fund Drives row in Giving opens the active drive directly, no
   listing page in between (the list remains for when no drive is active),
   and the drive's report reads as two columns on a PC: story beside
   progress, breakdown beside ministry giving.

   v27 — Giving's strip carries Live Balances and Reports as two pages
   again: the toggle that switched between them on one page is gone, and
   each opens on its own route.

   v28 — Moments keeps church events as albums: an event's own page holds
   every picture and video of the day, with a composer for the office and
   videos that play on the wall.

   v29 — the Treasury strip reads Ledger, Accounts, Expenditure, Drives,
   Budget, M-Pesa Refunds: a Budget desk of its own joins the row, where
   the treasurer posts the year's plan and publishes it.

   v30 — Elders' Desk and Clerk's Desk merge into one Eldership row: the
   two offices saw the same items, and the rail carries the register, the
   transfers, the settings, the meetings, the announcements and the
   requests under one heading.

   v31 — the rail's ministry and department rows read their short forms
   (AMM, AWM, APM, Personal…), so no row ever ellipsises.

   v32 — Moments leaves the Fellowship strip: the wall is the
   administrators' gallery now, reached from its own page, and posting is
   theirs alone.

   v33 — the Fellowship strip reads Announcements, Calendar, Moments,
   Testimonies, Ideas, Ideas & Suggestions shortens to Ideas, and every
   top-bar button drops its icon: names only.

   v34 — Leadership rides the Eldership strip as its second page, and the
   choir hangs with the music desk on one Music row: two fewer rows on
   the rail. Chrome changed, so installed apps must take the new shell.

   v35 — the Personal Ministries rail row takes its own initials, PM,
   matching its AMM, AWM, AYM and APM neighbours.

   v36 — dates read day-first everywhere, dd/mm/yyyy, through one shared
   helper: the ledger's from-date opens on the 1st of the month (it used to
   open on the first Sabbath, which hid the month's first receipts), and
   en-KE makes the native date pickers agree.

   v37 — a signed-in member requests a transfer from a modal that knows who
   they are: no name, email or phone to type, and nothing to verify by
   email — the session is the verification. Church settings loses its
   Administration badge.

   v38 — the rail reads Dashboard under a Dashboard heading of its own
   again, before My church.

   v39 — a department desk drops its header bar: the back arrow, the name
   repeated, and the “· 0 members · 0 events” count that read the same
   whatever the desk held.

   v40 — the transfer modal greets nobody: it just asks the two things the
   office cannot know. The membership row reads Transfer.

   v41 — a role card takes the whole width of the dashboard, whether the
   member serves one area or several.

   v42 — the roster's toggles read All, Members, S. School, Friends:
   active and inactive are found by search and switched in Actions. The
   clerkship's transfers desk is Membership Requests, and its filter reads
   the desk's own statuses, sitting left of the search.

   v43 — the Compact toggle is gone from every desk: one comfortable row
   height, everywhere.

   v44 — the rail reads Ministry, and a member sees their own areas there
   (music, the deaconate and APM under Ministries even before joining),
   with request-to-join and contact-department buttons when they belong
   to none.

   v45 — Health joins the Ministries heading as the church's health
   ministry: a Health row on the rail, its desk, leader role and join
   and contact flows.

   v46 — the deaconate seats its two offices, Head Deacon and Head
   Deaconess, instead of a generic Leader and Assistant — each office
   seated by the member's sex, and neither taking an assistant. The
   report composer's figures follow the period: moving the dates
   re-counts the ledger, names the report after the period until the
   desk types a title of their own, and the statement downloads beside
   Cancel.
   The dashboard's Your roles cards share the section's width — one
   equal row, however many areas a member serves. Departments and
   ministries gain an Accounts view: their fund's balance, the gifts
   that built it, and a withdrawal ask that lands with the treasurer.
   The in-kind giving record is drawn at the same dimensions as the
   money-giving one: one full-height card, one scroller. The rail's
   giving row is Giving again — the strips keep Money Giving — and a
   fund drive's progress and breakdown cards stand level on a PC.
   The treasury's rows read in full: Fund Drives and Church Budget.

   v47 — the church's areas are the member's own map: a member sees their
   age- and gender-based group (AMM, AWM, Young Adults, the rest) and any
   area they serve or hold a place on, while the offices see every row on
   the rail and in Your areas, which now shows for members too. The roll's
   Add member is the desk's and the office's hands only, gathers every
   picked name into one send, and the answer now reads "now belongs to".
   Each roll row gathers its deeds behind Actions — assign a role (the
   desk's own or one it names), reach the member, take them off — and
   Young Adults, Ambassadors and Children read a sex column, and AMM and
   AWM keep a Young Couples fellowship inside each — the desk's own toggle.
   The choir no longer stands alone on the rail — it keeps its place in
   the Music desk. On a phone a section's chips wrap into rows rather
   than slip past the strip's edge, reading their short names, so no
   page hides off-screen. Chrome changed, so installed apps must take
   the new shell.

   v48 — the announcements feed is one list again: the row of department
   tabs that rode under the toggles is gone, and a post addressed to a
   department or ministry wears that area's name on its card instead.
   The Fellowship strip's first chip reads Announcements again. Chrome
   changed, so installed apps must take the new shell.

   v49 — the rail's two office rows read Elder's Desk and Clerk's Desk,
   and the contributions ledger's status column reads Receipt: a giving
   says Sent, or Failed while its receipt has not gone out. On AMM and
   AWM the unit toggles ride the top strip — All · Young Couples · Single
   Parents · Calendar — and the ask to join waits under the roll instead
   of above it. The requests desk's membership row reads Membership
   transfer, and the deaconate's strip leads with its own team — the
   whole department desk, the same add-member hands as every other
   roll — and asks the office for property by a Send request button:
   to buy an item, or to repair one, answered at the requests desk.
   The giving row reads Giving. Chrome changed, so installed apps must
   take the new shell.

   v50 — the deaconate's Team view is its roll, read whole: the hub's
   Members / Calendar / Accounts toggles no longer ride under the desk's
   own strip, which already names Team, Inventory, Duty Rota and the
   Deaconate Calendar. A stray repeat of the Calendar toggle is gone from
   every other department's strip too, so Calendar reads once. Every page
   is now named above its toggles: the shell draws the page's title and
   one-line description from the registry, and the pages' own headings
   step aside.

   v51 — a ministry's or department's desk names itself too: the area's
   name and a line on what it is for stand above its own toggles, the
   heading the shell can't draw because those desks live inside the office
   console.

   v52 — the office desks name themselves too: the Treasury, the elders'
   desk and the clerk's desk each show their page's name and a line on what
   it does above their strip, as every other page does. The console's open
   desk now follows the address bar, so a strip toggle opens the page it
   names on the first press. A prayer request can now be addressed to the
   elders' desk, the pastor, or the whole church, and the desk it names is
   the one told. Chrome changed, so installed apps must take the new
   shell.

   v53 — a department's roll reads without the "Department roll" title bar:
   the desk's page name already stands above it, so only the search and the
   rows remain. In AWM and AMM the whole-roll toggle now reads "All
   members". Chrome changed, so installed apps must take the new shell.

   v54 — the deaconate's Team page now names itself with the rest of its
   desk: the description that rode the other deaconate pages reaches the
   page the desk opens on. Chrome changed, so installed apps must take the
   new shell.

   v55 — the office console's phone overview groups its cards by desk, the
   phone drops the page heading and its description to keep the height for
   the page, the clerk's record filter is a popover beside the search and
   Ambassadors reads inside the youth desk. Chrome changed, so installed
   apps must take the new shell.

   v56 — the treasury's heading follows the view: choosing Individual
   Givings or Summary Contributions names the ledger's own heading (it used
   to keep the Contributions Ledger row that led there), and Church
   Accounts, Income, Expenses and Requests name themselves on the accounts
   desk. Editing an account's information is now announced by a toast
   rather than a line in the page. Chrome changed, so installed apps must
   take the new shell.

   v57 — the treasury's Income view is gone: the strip reads Individual
   Givings, Summary Contributions, Church Accounts, Expenses and Requests,
   and Expenses now keeps the shape of its neighbours — the search and the
   category ride the shell's header beside the page's name, the rows are the
   shared table (cards on a phone), the total sits in the footer with the
   Record button, and recording or removing a record is a toast. Chrome
   changed, so installed apps must take the new shell.

   v58 — one strip again: the shell cleared a page's own toggles in an
   effect that ran after the page's, so the page's strip lost to the
   section's and the ledger read "Contributions Ledger" where Individual
   Givings and Summary Contributions belong. Sabbath School joins the
   Ministry rows, Expenses drops its receipt column, and Membership
   Requests keeps a single compact filter. Chrome changed, so installed
   apps must take the new shell.

   v59 — the session check stops shouting and stops lying offline: the
   gate reads the stored token before the browser paints, so a signed-in
   member never sees the wait screen; the console treats only an explicit
   401/403 as a denial, so a dropped connection no longer sends them to
   the sign-in page and back — the loop that kept them reloading; and the
   worker's one reload per generation is latched per tab and skipped while
   offline. Chrome changed, so installed apps must take the new shell.

   v60 — every date a person reads is day-first: the expenses date, the
   board and business meetings' date, the deaconate rota, a department's
   calendar events and a fund drive's dates went through the shared
   dd/mm/yyyy helper instead of showing the API's yyyy-mm-dd, and the
   ledger's opening date now follows the church's own month. Chrome
   changed, so installed apps must take the new shell.

   v61 — a failed request stops being read as a lost session: the header
   only drops to signed-out chrome when the server actually refuses the
   token (401/403), so a 500 or a dropped link no longer makes the app look
   logged out and no longer sends the dashboard to /login; the profile form
   and   the sign-in page say the connection is down instead of asking for a
   password again. Chrome changed, so installed apps must take the new
   shell.

   v62 — Expenses reads a window: the desk's header carries a From and a To
   date beside its search and category, opening on the church's month to
   date, and the table and its total answer only the spending inside it.

   v63 — Church Leadership's directory search takes its place beside the
   page's name with every other desk's: it used to stand alone above the
   table instead of in the shell's header row. Chrome changed, so installed
   apps must take the new shell.

   v64 — the deaconate's two offices read true: the Head Deaconess keeps her
   own name on the board instead of reading "Head Deaconess · Assistant",
   the Head Deacon seat refuses a woman in the roll's Assign role dialog as
   it already did in the leadership editor, and the Team view carries a
   second Add Member at the right of the section's toggles on a wide screen.
   Chrome changed, so installed apps must take the new shell.

   v65 — the phone's bar carries the church's people: My Areas takes the
   office console's tab (and the Materials tab is gone — Materials is a page
   of Fellowship now, read beside the news). My Areas is every member's page:
   two sub-navs, Ministry and Department, over the areas they belong to and
   the ones they could join, each card reading the area — leadership, roll
   and calendar, read-only. Neither office desks nor the sex-only
   fellowships are offered to the wrong member. Testimonies reads Testimonies
   on a phone, not Stories. Chrome changed, so installed apps must take the
   new shell.

   v66 — the colour mode leaves the top bar and lives on My Account: the bar
   no longer spends a control on light/dark, and System is the default, so
   the app follows the device until a member chooses Light or Dark for
   themselves in settings. The Summary Contributions totals row lines up
   with its columns (both tables now declare one fixed column grid). Chrome
   changed, so installed apps must take the new shell.

   v67 — the rail reads the youth ministries as the church names them: Young
   Adults is AYM, with Ambassadors its own row beside it (the fellowship
   rides the AYM desk as a unit, so each keeps its own roll). Join requests
   leave the foot of the roll and become a desk view on the strip, carrying
   the count of asks still waiting. Chrome changed, so installed apps must
   take the new shell.

   v68 — a member sees the areas they could join, not only the ones they are
   already in: the rail's Departments heading lists every joinable department
   (AYM, Ambassadors, Children) rather than only the member's own, with the
   offices never offered. The men's and women's fellowships show to their own
   sex. The choir reads Ensemble throughout. Chrome changed, so installed
   apps must take the new shell.

   v69 — the giving row reads Giving everywhere it is named, not only on the
   rail and the phone's short chips: the dashboard tile, the section strip's
   first chip and the page's own heading all drop "Money". The row is Giving;
   its In-Kind Giving neighbour says the rest. The treasury's strip gains a
   Fund Drives tab beside Church Accounts, and that same strip now rides the
   drives page with the tab marked, so a drive is reached and tracked without
   leaving the desk. Every desk view's search now rides the header band — the
   ensemble and the singing groups leave their own bars behind, and the
   department fund and the church's week gain one. Fund Drives opens on a
   shelf of cards — two to a row, even on a PC — instead of jumping straight
   into the first active drive, while a shared invite link still opens the
   drive itself. Chrome changed, so installed apps must take the new shell. */
const CACHE_NAME = "sda-loma-linda-meru-v69";
const STATIC_ASSETS = [
  "/",
  "/about/",
  "/beliefs/",
  "/calendar/",
  "/announcements/",
  "/give/",
  "/login/",
  "/requests/",
  "/share/",
  "/share/sabbath-school/",
  "/share/moments/",
  "/spiritual/",
  "/support/",
  "/manifest.json",
  "/manifest.webmanifest",
  "/adventist-logo.svg",
  "/adventist-logo-white.svg",
  "/icons/meru/app-icon-192.png",
  "/icons/meru/app-icon-512.png",
  "/icons/meru/app-icon-512-maskable.png",
  "/icons/meru/apple-touch-icon.png",
];

async function cacheStaticAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(STATIC_ASSETS.map(async (asset) => {
    try {
      const response = await fetch(asset, { cache: "no-cache" });
      if (response.ok) await cache.put(asset, response);
    } catch {
      // One unavailable asset must not prevent the service worker from installing.
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheStaticAssets().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cachedPage(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const url = new URL(request.url);
  const normalizedPath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return (await caches.match(normalizedPath, { ignoreSearch: true })) || (await caches.match("/"));
}

function remember(request, response) {
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
  return response;
}

/* Hashed build assets are immutable: their URL only ever maps to one file, so
   the cache copy is always valid. Crucially, when the network answers 404
   (a purged chunk from an older build that a stale page shell still asks
   for) we serve the cached copy instead of passing the 404 through — that
   404 used to blank the page. */
async function cacheFirstImmutable(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) return remember(request, response);
    const fallback = await caches.match(request, { ignoreSearch: true });
    return fallback || response;
  } catch (error) {
    const fallback = await caches.match(request, { ignoreSearch: true });
    return fallback || Response.error();
  }
}

/* Pages: always prefer the network so members see fresh content. Only a dead
   server (5xx) or no network falls back to the last cached shell — a real
   404 for a genuinely missing page still passes through. */
async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok) return remember(request, response);
    if (response.status >= 500) {
      const fallback = await cachedPage(request);
      return fallback || response;
    }
    return response;
  } catch (error) {
    const fallback = await cachedPage(request);
    return fallback || Response.error();
  }
}

/* Everything else (API calls, dynamic GETs): network first, cache successful
   responses for offline use. HTTP error responses (401, 403, 404 …) are
   returned untouched — never mask them with stale cache, or a logged-out
   member would see old data instead of being asked to sign in again. */
async function networkOnlyFallbackOffline(request) {
  try {
    const response = await fetch(request);
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      return remember(request, response);
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    return cached || Response.error();
  }
}

/* ── Web Push ────────────────────────────────────────────────────────────
   The server encrypts a small JSON payload ({title, body, link}) to each
   device; the browser wakes this worker even with the app closed and the
   OS shows the notification. Clicking it deep-links into the app. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "SDA Loma Linda";
  const options = {
    body: payload.body || "",
    icon: "/icons/meru/app-icon-192.png",
    badge: "/icons/meru/app-icon-192.png",
    tag: payload.link || undefined, // one notice per destination, no stacking
    data: { link: payload.link || "/administration?tab=requests" },
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an existing window of this app if one is open.
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "push-navigate", link: target });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // third-party: untouched

  const isImmutable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    /\.(svg|png|jpg|jpeg|webp|woff2?)$/.test(url.pathname);

  if (isImmutable) {
    event.respondWith(cacheFirstImmutable(event.request));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstPage(event.request));
    return;
  }

  event.respondWith(networkOnlyFallbackOffline(event.request));
});
