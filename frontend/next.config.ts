import withPWAInit from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

import { computeBuildId } from "./scripts/build-version.mjs";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
  },
});

const nextConfig: NextConfig = {
  // The frontend is deployed as static assets through a Cloudflare Worker.
  // Runtime data is fetched from the Django API in the browser.
  output: "export",
  trailingSlash: true,
  // Silence Turbopack/webpack mismatch warning introduced by next-pwa
  turbopack: {},
  // The build names itself so a tab that is still running an older bundle can
  // notice a deploy instead of waiting for the next sign-in: this is the name
  // the running code knows itself by, and `scripts/build-version.mjs` writes
  // the same name into `out/version.json` for `UpdateNotice` to compare with.
  env: { NEXT_PUBLIC_APP_BUILD_ID: computeBuildId() },
};

export default withPWA(nextConfig);
