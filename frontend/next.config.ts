import withPWAInit from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

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
};

export default withPWA(nextConfig);
