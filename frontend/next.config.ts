import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The frontend is deployed as a static Cloudflare Pages site.
  // Runtime data is fetched from the Django API in the browser.
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
