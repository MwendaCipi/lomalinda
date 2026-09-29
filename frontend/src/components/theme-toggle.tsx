"use client";

import { Moon, Sun } from "lucide-react";

import { useAccessibility } from "@/context/accessibility-context";

/**
 * Light or dark, from the top bar.
 *
 * One button rather than a menu: the choice is binary and the icon shows what
 * you are switching *to*, which is what a reader wants from a one-tap control.
 * The preference is stored with the other display settings, so it survives a
 * reload and resets with them.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useAccessibility();
  const dark = theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  // The host may hand in a dark tile (the app bar and the marketing header both
  // do), in which case the icons take the chrome's own light inks rather than
  // the page palette's, which would disappear on bark.
  const onDarkChrome = Boolean(className);

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      title={label}
      aria-label={label}
      aria-pressed={dark}
      className={
        className ??
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sand-mute bg-white text-bark transition hover:bg-sand"
      }
    >
      {dark ? (
        <Sun className={`h-4 w-4 ${onDarkChrome ? "text-gold" : "text-ember"}`} />
      ) : (
        <Moon className={`h-4 w-4 ${onDarkChrome ? "text-white/80" : "text-moss"}`} />
      )}
    </button>
  );
}
