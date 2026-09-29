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
      {dark ? <Sun className="h-4 w-4 text-ember" /> : <Moon className="h-4 w-4 text-moss" />}
    </button>
  );
}
