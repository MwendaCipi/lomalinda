"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { A11Y_STORAGE_KEY as STORAGE_KEY, type ThemeChoice } from "@/lib/theme";

export type FontSizeOption = "normal" | "large" | "xlarge";

export interface AccessibilityPrefs {
  fontSize: FontSizeOption;
  highContrast: boolean;
  dyslexicFont: boolean;
  reducedMotion: boolean;
  highVisFocus: boolean;
  /** System, light or dark. Stored here so one "Reset Defaults" resets
      everything. */
  theme: ThemeChoice;
}

interface AccessibilityContextType extends AccessibilityPrefs {
  setFontSize: (size: FontSizeOption) => void;
  setHighContrast: (val: boolean) => void;
  setDyslexicFont: (val: boolean) => void;
  setReducedMotion: (val: boolean) => void;
  setHighVisFocus: (val: boolean) => void;
  setTheme: (theme: ThemeChoice) => void;
  resetDefaults: () => void;
}

const DEFAULT_PREFS: AccessibilityPrefs = {
  fontSize: "normal",
  highContrast: false,
  dyslexicFont: false,
  reducedMotion: false,
  highVisFocus: false,
  // Light until someone asks for dark: the theme is opt-in, never inferred
  // from the device, so a member's screen looks the same as it did before a
  // dark palette existed.
  // System is the default: the app follows the device until the member picks
  // Light or Dark for themselves.
  theme: "system",
};

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(() => {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_PREFS, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_PREFS;
  });

  // The device's own preference, tracked live: on System the app must follow it
  // as it changes, not only read it once at first paint. Only the attribute
  // below depends on this, never the markup, so there is no hydration gap.
  const [deviceIsDark, setDeviceIsDark] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setDeviceIsDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const updatePref = <K extends keyof AccessibilityPrefs>(key: K, value: AccessibilityPrefs[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const setFontSize = (size: FontSizeOption) => updatePref("fontSize", size);
  const setHighContrast = (val: boolean) => updatePref("highContrast", val);
  const setDyslexicFont = (val: boolean) => updatePref("dyslexicFont", val);
  const setReducedMotion = (val: boolean) => updatePref("reducedMotion", val);
  const setHighVisFocus = (val: boolean) => updatePref("highVisFocus", val);
  const setTheme = (theme: ThemeChoice) => updatePref("theme", theme);

  const resetDefaults = () => {
    setPrefs(DEFAULT_PREFS);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PREFS));
    } catch {
      // ignore
    }
  };

  // Sync DOM attributes on documentElement whenever prefs change
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    root.setAttribute("data-font-size", prefs.fontSize);

    if (prefs.highContrast) root.setAttribute("data-high-contrast", "true");
    else root.removeAttribute("data-high-contrast");

    if (prefs.dyslexicFont) root.setAttribute("data-dyslexic-font", "true");
    else root.removeAttribute("data-dyslexic-font");

    if (prefs.reducedMotion) root.setAttribute("data-reduced-motion", "true");
    else root.removeAttribute("data-reduced-motion");

    if (prefs.highVisFocus) root.setAttribute("data-focus-ring", "high");
    else root.removeAttribute("data-focus-ring");

    // The dark palette hangs off this attribute. `color-scheme` rides along in
    // CSS so form controls and scrollbars follow. On System the device decides.
    const dark = prefs.theme === "dark" || (prefs.theme === "system" && deviceIsDark);
    if (dark) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
  }, [prefs, deviceIsDark]);

  return (
    <AccessibilityContext.Provider
      value={{
        ...prefs,
        setFontSize,
        setHighContrast,
        setDyslexicFont,
        setReducedMotion,
        setHighVisFocus,
        setTheme,
        resetDefaults,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) {
    return {
      ...DEFAULT_PREFS,
      setFontSize: () => {},
      setHighContrast: () => {},
      setDyslexicFont: () => {},
      setReducedMotion: () => {},
      setHighVisFocus: () => {},
      setTheme: () => {},
      resetDefaults: () => {},
    };
  }
  return ctx;
}
