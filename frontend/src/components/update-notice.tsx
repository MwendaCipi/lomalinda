"use client";

/**
 * The deploy notice.
 *
 * A browser keeps running the bundle it downloaded until the document
 * reloads, and an installed app can hold one for days: a member then taps a
 * button that a new build has already moved, or misses a fix entirely, while
 * everything on the server says the deploy went out. The old working answer
 * was a reload on every service-worker hand-over, which only covers a tab
 * whose worker happens to update — not a plain browser tab, not a phone that
 * was never installed, and nothing at all while the worker's own script is
 * unchanged.
 *
 * So this asks the site what it is serving: `out/version.json` carries the
 * build's name (`scripts/build-version.mjs`), and the bundle carries its own,
 * injected at build time. When the two differ, the server has moved on and the
 * reader is offered a reload — quietly, in a corner, and dismissible for the
 * tab, because a reload is the reader's decision and can cost them a
 * half-written form.
 *
 * The file is fetched with a cache-busting query and `no-store`, so neither
 * the browser's cache nor a service worker's precache can answer with the copy
 * from the build that asked the question.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";

/** This bundle's own name, injected by next.config.ts. Empty if unbranded. */
const RUNNING_BUILD = process.env.NEXT_PUBLIC_APP_BUILD_ID ?? "";
/** How often a tab that is being looked at asks the site what it serves. */
const POLL_MS = 5 * 60 * 1000;
/** The first ask waits for the page to settle; a deploy is not urgent. */
const FIRST_CHECK_MS = 8 * 1000;
/** Where a dismissed offer is remembered — per tab, not per device. */
const DISMISS_KEY = "app_update_dismissed";

/** The build the site is serving now, or null when it cannot be told. */
async function fetchLiveBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?ts=${Date.now()}`, {
      cache: "no-store",
      // A stale note about a deploy that never landed is worse than no note.
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const buildId = (body as { buildId?: unknown } | null)?.buildId;
    return typeof buildId === "string" && buildId ? buildId : null;
  } catch {
    // Offline, blocked, or a site that predates the file: nothing to say.
    return null;
  }
}

export function UpdateNotice() {
  const [liveBuild, setLiveBuild] = useState<string | null>(null);
  const askingRef = useRef(false);

  const check = useCallback(async () => {
    if (askingRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (document.visibilityState === "hidden") return;
    askingRef.current = true;
    try {
      const build = await fetchLiveBuild();
      if (!build || build === RUNNING_BUILD) {
        // Back to the build this tab is already running (or a site that
        // cannot say): whatever was offered is no longer true.
        setLiveBuild(null);
        return;
      }
      // An offer this tab already turned down is not repeated for this build;
      // the next deploy names a different build and may ask again.
      let dismissed: string | null = null;
      try {
        dismissed = sessionStorage.getItem(DISMISS_KEY);
      } catch {
        // Storage switched off: the offer may return, which is harmless.
      }
      setLiveBuild(dismissed === build ? null : build);
    } finally {
      askingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Development builds in the maintainer's checkout are not deployments,
    // and `out/` there is whatever the last production build left behind.
    if (!RUNNING_BUILD || process.env.NODE_ENV === "development") return;

    const first = window.setTimeout(check, FIRST_CHECK_MS);
    const poll = window.setInterval(check, POLL_MS);
    // A tab that was in the background for hours should know as soon as it is
    // looked at again, rather than up to a poll interval later.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onOnline = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [check]);

  const reload = useCallback(async () => {
    // Ask the worker for its newest script before the document comes back:
    // an installed app would otherwise reload into the shell it already had.
    try {
      const registration = await navigator.serviceWorker?.getRegistration?.();
      await registration?.update();
    } catch {
      // No worker, or no network for it: reload is still worth trying.
    }
    window.location.reload();
  }, []);

  const dismiss = useCallback(() => {
    if (liveBuild) {
      try {
        sessionStorage.setItem(DISMISS_KEY, liveBuild);
      } catch {
        // Storage switched off: the offer simply may return.
      }
    }
    setLiveBuild(null);
  }, [liveBuild]);

  if (!liveBuild) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-sand-mute bg-white px-4 py-3 text-bark shadow-lg md:bottom-6"
    >
      <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-ember" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">A newer version is ready</p>
        <p className="mt-0.5 text-xs text-moss">
          Reload to pick up the latest changes. Anything you have typed is worth finishing first.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={reload}
            className="rounded-xl bg-ember px-3 py-1.5 text-xs font-bold text-white transition hover:bg-ember-dark"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl px-2 py-1.5 text-xs font-semibold text-moss transition hover:text-bark"
          >
            Later
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss the update notice"
        className="shrink-0 rounded-lg p-0.5 text-moss transition hover:text-bark"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
