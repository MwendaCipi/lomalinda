#!/usr/bin/env node
/**
 * Lint only what changed — the pre-deploy middle step.
 *
 * "Changed" = every lintable file touched since the merge-base with the
 * upstream branch (committed work) PLUS every uncommitted modification and
 * untracked file. With no upstream configured it falls back to the working
 * tree only.
 *
 * The gate fails on NEW errors: each changed file's error count is compared
 * against `.eslint-baseline.json` (the repo's known lint debt, one count per
 * file). Fixing debt is encouraged — regenerate the baseline when counts
 * drop so the guard tightens:
 *
 *   npm run lint:changed              # gate for predeploy
 *   npm run lint:baseline             # regenerate .eslint-baseline.json
 *   node scripts/lint-changed.mjs HEAD~3   # explicit base instead
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // frontend/scripts
const FRONTEND = path.join(here, ".."); // eslint runs from the frontend root
const REPO = path.join(FRONTEND, ".."); // git paths are repo-root-relative
const BASELINE = path.join(FRONTEND, ".eslint-baseline.json");
const LINTABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const PREFIX = "frontend/";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", cwd: here }).trim();
}

function mergeBaseWithUpstream() {
  try {
    const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
    return git(["merge-base", "HEAD", upstream]);
  } catch {
    return null; // no upstream — fall back to the working tree only
  }
}

function collect(base) {
  const set = new Set();
  const addDiff = (args) => {
    const out = execFileSync("git", args, { encoding: "utf8", cwd: here }).trim();
    for (const line of out.split("\n")) {
      const p = line.trim();
      if (p && LINTABLE.test(p) && p.startsWith(PREFIX)) set.add(p);
    }
  };
  if (base) addDiff(["diff", "--name-only", `${base}..HEAD`]);
  // Anything uncommitted: staged, unstaged, and untracked-but-not-ignored.
  addDiff(["diff", "--name-only", "HEAD"]);
  addDiff(["ls-files", "--others", "--exclude-standard"]);
  // Keep only files that still exist on disk (skip deletions), as eslint
  // paths relative to frontend/.
  return [...set]
    .filter((p) => existsSync(path.join(REPO, p)))
    .map((p) => path.relative(FRONTEND, path.join(REPO, p)));
}

function runEslint(files) {
  const res = spawnSync("npx", ["eslint", "-f", "json", ...files], {
    encoding: "utf8",
    cwd: FRONTEND,
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
  // eslint exits 1 when it finds problems — that is data here, not a crash.
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(res.stderr || "eslint produced no report");
    process.exit(2);
  }
}

function counts(report) {
  const map = new Map();
  for (const { filePath, errorCount, warningCount } of report) {
    map.set(filePath, { errors: errorCount, warnings: warningCount });
  }
  return map;
}

// ---- baseline mode ---------------------------------------------------------
if (process.argv.includes("--write-baseline")) {
  const report = runEslint(["."]);
  const out = {};
  for (const { filePath, errorCount } of report) {
    if (errorCount > 0) out[path.relative(FRONTEND, filePath)] = errorCount;
  }
  writeFileSync(BASELINE, JSON.stringify(out, null, 2) + "\n");
  const total = Object.values(out).reduce((a, b) => a + b, 0);
  console.log(
    `Baseline written: ${Object.keys(out).length} files, ${total} known errors.\n` +
      "Commit it. Regenerate whenever the debt shrinks so the guard tightens."
  );
  process.exit(0);
}

// ---- gate mode --------------------------------------------------------------
const base = mergeBaseWithUpstream();
const files = collect(base);
if (files.length === 0) {
  console.log("lint:changed — no changed lintable files; nothing to do.");
  process.exit(0);
}

console.log(
  `lint:changed — ${files.length} file${files.length === 1 ? "" : "s"} vs ${base ?? "working tree only"}`
);

const report = runEslint(files);
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const linted = counts(report);

let failed = false;
const lines = [];
for (const [file, { errors, warnings }] of linted) {
  const rel = path.relative(FRONTEND, file);
  const known = baseline[rel] ?? 0;
  if (errors > known) {
    failed = true;
    lines.push(`  ✗ ${rel}: ${errors} error(s), baseline allows ${known} (+${errors - known})`);
  } else if (errors > 0) {
    lines.push(`  · ${rel}: ${errors} known lint error(s) — not new`);
  } else if (warnings > 0) {
    lines.push(`  · ${rel}: ${warnings} warning(s)`);
  }
}

if (lines.length) console.log(lines.join("\n"));

// Surface the actual messages for any file that regressed.
if (failed) {
  const regressed = [...linted]
    .filter(([file, { errors }]) => errors > (baseline[path.relative(FRONTEND, file)] ?? 0))
    .map(([file]) => path.relative(FRONTEND, file));
  console.error("");
  for (const entry of report) {
    const rel = path.relative(here, entry.filePath);
    if (!regressed.includes(rel)) continue;
    for (const m of entry.messages.filter((x) => x.severity === 2)) {
      console.error(`${rel}:${m.line}:${m.column}  ${m.message}  (${m.ruleId ?? ""})`);
    }
  }
  console.error("\n✗ lint:changed — new lint errors (see above). Fix them or, if truly pre-existing debt, regenerate the baseline.");
  process.exit(1);
}

console.log("✓ lint:changed — no new lint errors.");
