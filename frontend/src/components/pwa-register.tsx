"use client";

import { useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

/**
 * What this device calls installing.
 *
 * iOS and macOS Safari have no install icon and never fire
 * `beforeinstallprompt` — Safari's Share sheet (iOS) and File menu (macOS)
 * offer "Add to Home Screen" instead, so a row that raises it should use the
 * words the reader will actually find on screen. Everywhere else the browser's
 * own prompt says "Install", and so does the row.
 *
 * The answer lives in `navigator`, so a caller renders the default and asks
 * after paint rather than guessing at the server's blank user agent.
 */
export function pwaInstallLabel(): string {
  if (typeof navigator === "undefined") return "Install the app";
  const ua = navigator.userAgent;
  // iPadOS 13 and up present themselves as a Mac; the give-away is a desktop
  // Safari string on a device that reports more than one touch point.
  const isIpadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || isIpadOs) return "Add to Home Screen";
  // Safari proper on a Mac — not Chrome, Edge, Firefox or an Electron shell
  // wearing the same platform string, each of which keeps the install icon.
  const isMacSafari =
    /Macintosh/.test(ua) &&
    /Safari\//.test(ua) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Electron/.test(ua);
  return isMacSafari ? "Add to Home Screen" : "Install the app";
}

export function triggerPwaInstall() {
  if (globalDeferredPrompt) {
    globalDeferredPrompt.prompt().then(() => {
      globalDeferredPrompt?.userChoice.then((choice) => {
        if (choice.outcome === "accepted") {
          globalDeferredPrompt = null;
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("pwa-state-changed"));
          }
        }
      });
    });
  } else if (typeof window !== "undefined") {
    showAlert(
      "Install the app",
      "Chrome / Edge on Desktop: click the Install icon in the address bar.\n\nSafari on iPhone / Mac: tap Share, then Add to Home Screen.",
      "info"
    );
  }
}

export function PwaRegister() {
  const [showMobileBanner, setShowMobileBanner] = useState(false);

  useEffect(() => {
    // Register Service Worker
    //
    // `.register` is called from here rather than only from a `load` listener:
    // this component hydrates after the document has often already finished
    // loading, and a listener added to an event that has fired never runs. The
    // worker would then never be registered on that visit at all — which is
    // invisible for the offline shell but fatal for push, because everything
    // push needs (the bell's switch, the permission ask, the re-registration of
    // a rotated subscription) starts from `getRegistration("/")`. Ask the
    // document where it already is instead of assuming the event is still
    // ahead of us.
    // Development keeps no worker: `next-pwa` is disabled there, so `/sw.js`
    // is whatever the last production build left in `public/` — an old worker
    // then hands the dev server's pages its own cached chunks, and the code on
    // screen stops being the code in the editor.
    if (
      process.env.NODE_ENV !== "development" &&
      typeof window !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      const registerWorker = () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => console.log("PWA Service Worker registered:", reg.scope))
          .catch((err) => console.error("Service Worker registration failed:", err));
      };
      if (document.readyState === "complete") {
        registerWorker();
      } else {
        window.addEventListener("load", registerWorker, { once: true });
      }
    }

    // The installed app paints the build it loaded with until the document
    // reloads, so a member can be looking at last week's shell while the
    // server serves this week's. `sw.js` takes over at once
    // (`skipWaiting` + `clients.claim`); the moment an updated worker
    // controls the page, reload once so what is on screen is the build that
    // just landed. Only when a worker was already in charge — on a first
    // install there is nothing to replace and a reload would be noise.
    const hadController = Boolean(navigator.serviceWorker.controller);
    // One reload per tab, not one per page load. The worker takes over at once
    // (`skipWaiting` + `clients.claim`), so every activation raises this event;
    // reloading on each one turns a worker that keeps re-activating — or a
    // flaky link that keeps re-fetching the script — into an endless refresh
    // loop. The latch lives in sessionStorage so it survives the reload it
    // causes, and the reload is skipped entirely while the browser is offline,
    // where a reload can only land on a cached shell.
    const RELOAD_LATCH = "sw_reload_for_version";
    let reloadedThisSession = (() => {
      try {
        return Boolean(sessionStorage.getItem(RELOAD_LATCH));
      } catch {
        return false;
      }
    })();
    const handleControllerChange = () => {
      if (!hadController || reloadedThisSession) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      reloadedThisSession = true;
      try {
        sessionStorage.setItem(RELOAD_LATCH, String(Date.now()));
      } catch {
        // Storage switched off: the in-memory latch still bounds this page.
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("pwa-state-changed"));

        // Only show floating banner on small mobile screens (< 768px) AND if not dismissed before
        const isMobile = window.innerWidth < 768;
        const isDismissed = localStorage.getItem("pwa_install_dismissed") === "true";

        if (isMobile && !isDismissed) {
          setShowMobileBanner(true);
        }
      }
    };

    const handleTriggerInstall = () => {
      triggerPwaInstall();
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("trigger-pwa-install", handleTriggerInstall);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("trigger-pwa-install", handleTriggerInstall);
    };
  }, []);

  const handleDismiss = () => {
    setShowMobileBanner(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("pwa_install_dismissed", "true");
    }
  };

  const handleInstall = () => {
    setShowMobileBanner(false);
    triggerPwaInstall();
  };

  if (!showMobileBanner) return null;

  return (
    <div className="fixed bottom-[68px] md:bottom-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-2xl border border-sand-mute bg-bark p-3.5 text-white shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ember font-bold text-white text-xs">
            SDA
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-white truncate">Install the SDA Church Loma Linda app</h4>
            <p className="text-[11px] text-white/80 truncate">Quick access &amp; offline support.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleInstall}
            className="rounded-xl bg-ember px-3 py-1.5 text-xs font-bold text-white transition hover:bg-ember-dark"
          >
            Install
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 text-xs text-white/60 hover:text-white"
            aria-label="Dismiss banner"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
