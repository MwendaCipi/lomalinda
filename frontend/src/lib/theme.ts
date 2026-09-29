"use client";

/**
 * Light and dark, for the whole app.
 *
 * The two themes are the same design drawn on two papers: every colour the
 * app paints comes from the `--color-*` tokens in globals.css, so a theme is a
 * set of token values rather than a second stylesheet. This module owns the
 * small amount of machinery that has to exist outside React — the storage key,
 * and the snippet below that runs before the first paint so a member who chose
 * dark never sees a flash of light.
 *
 * The choice itself lives with the other display preferences (font size, high
 * contrast) in the accessibility context, which is what writes the attribute
 * and persists it. Keeping one store means "Reset Defaults" resets the theme
 * with everything else, instead of leaving a stray dark app behind.
 */

/** The display preferences blob — shared with AccessibilityProvider. */
export const A11Y_STORAGE_KEY = "sda_church_a11y_prefs";

export type ThemeChoice = "light" | "dark";

/**
 * Applied to <html> before the app hydrates.
 *
 * Deliberately tiny and dependency-free: it parses the stored preferences,
 * and if they say dark it stamps the attribute the dark palette hangs off.
 * Any failure (no storage, malformed JSON) leaves the light theme, which is
 * the app's default — the theme is opt-in, never inferred from the device.
 */
export const themeInitScript = `(function(){try{var p=JSON.parse(localStorage.getItem("${A11Y_STORAGE_KEY}")||"{}");if(p&&p.theme==="dark"){document.documentElement.setAttribute("data-theme","dark");}}catch(e){}})();`;
