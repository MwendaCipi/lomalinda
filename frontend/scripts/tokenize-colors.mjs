/**
 * One-shot codemod: replace hard-coded brand hexes with @theme token classes.
 *
 * Usage:  node scripts/tokenize-colors.mjs           (writes)
 *         node scripts/tokenize-colors.mjs --check   (report only)
 *
 * Safe to re-run: when nothing needs replacing, no file bytes change.
 *
 * The @theme palette itself lives in src/app/globals.css as --color-<name>
 * custom properties; the TOKENS map below is the hex -> token name mapping.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const TOKENS = {
  // Deep green-black (header, hero, footer)
  "26352f": "bark",
  "1e2a25": "bark-900",
  "1a2420": "bark-950",
  "1c2924": "bark-hover",
  "31483e": "bark-raised",
  // Muted green-gray text
  "617068": "moss",
  "3d5148": "moss-dark",
  "415047": "moss-mid",
  "4a5851": "moss-soft",
  "4a564f": "moss-dim",
  "3a4a43": "moss-hover",
  "8b9790": "moss-faint",
  "8a948d": "moss-faint2",
  "8a8378": "warmgray",
  "a1a1a1": "graydim",
  "9ca3af": "graymuted",
  "6b7280": "grayui",
  // Terracotta (buttons, accents, badges)
  "b36b3c": "ember",
  "96552e": "ember-dark",
  "96552c": "ember-deep",
  "a35622": "ember-shade",
  "8c572b": "ember-soft",
  "8c4b18": "ember-rust",
  // Warm golds & tans (highlights on dark, notice tints)
  "f1c89e": "gold",
  "e0c9a8": "gold-soft",
  "f7e3d2": "gold-pale",
  "f5d0a9": "gold-bright",
  "f0e6dc": "gold-blush",
  "9a741c": "gold-deep",
  "7c5d16": "gold-shadow",
  "8a7a5c": "gold-olive",
  "5c3a1c": "gold-brown",
  "e2d5b6": "gold-sand",
  // Warm sand backgrounds & lines (the paper of the app)
  "f7f4ee": "sand",
  "dfdbd1": "sand-line",
  "c9c5bb": "sand-mute",
  "e5dfd2": "sand-deep",
  "cfc9bd": "sand-edge",
  "b9b3a6": "sand-hoverline",
  "eae6de": "sand-tint",
  "eeeae2": "sand-soft",
  "e8e2d5": "sand-warm",
  "eae4d8": "sand-shade",
  "e9e5dd": "sand-wash",
  "e6e2d8": "sand-sheen",
  "f2efe8": "sand-light",
  "f0ece3": "sand-paper",
  "ede8dc": "sand-grain",
  "faf9f5": "sand-card",
  "fcfbf9": "sand-plate",
  "faf9f6": "sand-vellum",
  "faf8f3": "sand-silk",
  "faf7f2": "sand-linen",
  "faf7f0": "sand-veil",
  "fdfbf7": "sand-mist",
  "fdf8ef": "sand-cream",
  "fdf3eb": "sand-sheer",
  "fbf6f0": "sand-airy",
  "fdf6ec": "sand-glow",
  "fff7ec": "sand-bright",
  "dfd9cb": "sand-hover",
  "f0ede6": "sand-haze",
  "f4f1ea": "sand-film",
  // Sage greens (success, positive money, accents)
  "5f8067": "sage",
  "4d6d55": "sage-deep",
  "3d7146": "sage-strong",
  "335e3a": "sage-shade",
  "2d5d39": "sage-bright",
  "2e5735": "sage-deepest",
  "305a38": "sage-deep2",
  "4a7256": "sage-mid",
  "4e6b55": "sage-soft",
  "3d6b4f": "sage-rich",
  "4a5b52": "sage-gray",
  "6d7a71": "sage-slate",
  "7a8c56": "sage-lime",
  "d5dfd7": "sage-wash",
  "c9d5ca": "sage-mist",
  "c1d0c4": "sage-line",
  "c4d6c8": "sage-mild",
  "88b393": "sage-light",
  "a9bcae": "sage-pale",
  "dce6da": "sage-breathe",
  "c1d7c9": "sage-air",
  "dce9df": "sage-tint",
  "8a968d": "sage-fog",
  "d0ddca": "leaf",
  "dce9dd": "leaf-wash",
  // Cool near-white greens (selected/active surfaces)
  "f4f7f4": "mist",
  "f4f7f2": "mist-tint",
  "e8f3ec": "mist-soft",
  "f0f7f2": "mist-veil",
  "eef2ed": "mist-select",
  // Alert reds
  "8c2e2e": "brick",
  "b91c1c": "alert",
  "991b1b": "alert-deep",
  "a05252": "alert-soft",
  "8c3a3a": "alert-shade",
  "fdf2f2": "alert-wash",
  "fde8e8": "alert-pale",
  "f3e8e8": "alert-film",
  "efe3e3": "alert-veil",
};

const hexToToken = new Map(Object.entries(TOKENS).map(([hex, name]) => [hex.toLowerCase(), name]));

let fileArgIdx = 0;
const CHECK = process.argv.includes("--check");

const files = execSync(`grep -rlE '#[0-9a-fA-F]{6}\\b' src --include='*.tsx'`, { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

let total = 0;
let touched = 0;
const perFile = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  let count = 0;

  // `bg-[#26352f]`, `hover:text-[#617068]`, `md:bg-[#f7f4ee]/60`, ... → tokens.
  // The bracketed value must be exactly a known brand hex (optional /opacity),
  // so sizes like text-[11px] can never collide.
  const out = content.replace(
    /((?:[a-zA-Z0-9-]+:)*)\b(bg|text|border|divide|ring|from|to|via|fill|stroke|outline|decoration|accent|caret|shadow|inset)-\[#([0-9a-fA-F]{6})\](\/[^\s\]"',)]+)?/g,
    (full, variants, util, hex, opacity) => {
      const token = hexToToken.get(hex.toLowerCase());
      if (!token) return full; // not a brand color — leave untouched
      count++;
      return `${variants}${util}-${token}${opacity ?? ""}`;
    }
  );

  if (out !== content) {
    if (!CHECK) writeFileSync(file, out);
    touched++;
    total += count;
    perFile.push([count, file]);
  }
}

for (const [count, file] of perFile.sort((a, b) => b[0] - a[0]))
  console.log(`${String(count).padStart(4)}  ${file}`);
console.error(`\n${touched} files, ${total} replacements ${CHECK ? "pending" : "written"}.`);

// `--check` is a guard: a pending replacement fails the run so pre-deploy
// checks and CI catch untokenized brand hexes before they ship.
if (CHECK && total > 0) process.exit(1);
