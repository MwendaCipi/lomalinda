"use client";

/**
 * The colour mode, for the whole app.
 *
 * The two palettes are the same design drawn on two papers: every colour the
 * app paints comes from the `--color-*` tokens in globals.css, so a theme is a
 * set of token values rather than a second stylesheet. This module owns the
 * small amount of machinery that has to exist outside React — the storage key,
 * and the snippet below that runs before the first paint so a member on a dark
 * device never sees a flash of light.
 *
 * The mode is *system* by default: the app follows the device, and keeps
 * following it as the device switches, until the member chooses Light or Dark
 * for themselves on the My Account page. The choice lives with the other
 * display preferences (font size, high contrast) in the accessibility context,
 * which is what writes the attribute and persists it. Keeping one store means
 * "Reset Defaults" resets the colour mode with everything else, instead of
 * leaving a stray palette behind.
 */

/** The display preferences blob — shared with AccessibilityProvider. */
export const A11Y_STORAGE_KEY = "sda_church_a11y_prefs";

/**
 * System follows the device; Light and Dark are the member's own choice. The
 * stored default is System, which is what a member who never opens the page
 * gets — and what "Reset Defaults" returns them to.
 */
export type ThemeChoice = "system" | "light" | "dark";

/**
 * Applied to <html> before the app hydrates.
 *
 * Deliberately tiny and dependency-free: it parses the stored preferences and
 * stamps the attribute the dark palette hangs off when the mode resolves to
 * dark — either because the member chose Dark, or because they are on System
 * (or have no stored choice at all) and their device is dark. Any failure (no
 * storage, malformed JSON) leaves the light palette rather than throwing.
 */
export const themeInitScript = `(function(){try{var p=JSON.parse(localStorage.getItem("${A11Y_STORAGE_KEY}")||"{}");var t=p&&p.theme;var q=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");if(t==="dark"||((!t||t==="system")&&q&&q.matches)){document.documentElement.setAttribute("data-theme","dark");}}catch(e){}})();`;
