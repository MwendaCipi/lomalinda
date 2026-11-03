#!/usr/bin/env node
/**
 * The name of the build, written beside the site as `version.json`.
 *
 * A deploy cannot reach into a browser that is already open: the tab keeps
 * running the bundle it downloaded, so after a deploy it is a version behind
 * the server, and on an installed app that can last for days. So a build
 * names itself twice — once inside the JavaScript the browser is running
 * (`NEXT_PUBLIC_APP_BUILD_ID`, injected by `next.config.ts`) and once in this
 * small file at the site's root — and the app compares the two. `UpdateNotice`
 * does the comparing; this script only decides the name and writes the file.
 *
 * The name is the commit the build came from. Every deploy moves the commit,
 * and a rebuild of the same commit is the same build, which is exactly what
 * "is the bundle I am running still the one on the server?" should mean.
 *
 * Written *after* `next build` (see package.json) on purpose: the exported
 * site is finished by then, so the file is never part of the service worker's
 * precache list — a cached copy of it would always answer with its own build
 * number and the check would never see a deploy.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

/**
 * The name this build goes by, on both sides of the comparison.
 *
 * `APP_BUILD_ID` lets a release name itself (CI, a tarball build); otherwise
 * the commit is the name. A checkout with no git history at all falls back to
 * a fixed label: both sides then always agree, so the app never offers a
 * reload it cannot deliver.
 */
export function computeBuildId() {
  const named = (process.env.APP_BUILD_ID || "").trim();
  if (named) return named;
  try {
    const sha = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
      // No git, or not a checkout: a silent miss, not a failed build.
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return sha || "unknown";
  } catch {
    return "unknown";
  }
}

// Run directly by the build script: write the file the app asks for.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const buildId = computeBuildId();
  const outDir = join(projectRoot, "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "version.json"),
    `${JSON.stringify({ buildId, writtenAt: new Date().toISOString() })}\n`,
    "utf8"
  );
  console.log(`version.json written for build ${buildId}`);
}
