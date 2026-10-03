"use client";

import { useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

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
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => console.log("PWA Service Worker registered:", reg.scope))
          .catch((err) => console.error("Service Worker registration failed:", err));
      });
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
            <h4 className="text-xs font-bold text-white truncate">Install SDA Loma Linda App</h4>
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
