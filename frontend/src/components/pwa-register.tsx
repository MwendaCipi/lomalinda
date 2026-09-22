"use client";

import { useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";

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
      "Chrome / Edge on Desktop: click the Install icon (💻) in the address bar.\n\nSafari on iPhone / Mac: tap Share → Add to Home Screen.",
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
    <div className="fixed bottom-[68px] md:bottom-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-2xl border border-[#c9c5bb] bg-[#26352f] p-3.5 text-white shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#b36b3c] font-bold text-white text-xs">
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
            className="rounded-xl bg-[#b36b3c] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#96552e]"
          >
            Install
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 text-xs text-white/60 hover:text-white"
            aria-label="Dismiss banner"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
