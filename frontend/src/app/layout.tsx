import type { Metadata, Viewport } from "next";
import "./globals.css";
import "sweetalert2/dist/sweetalert2.min.css";
import { PwaRegister } from "@/components/pwa-register";
import { AccessibilityProvider } from "@/context/accessibility-context";
import { brand } from "@/lib/brand";
import { authInitScript, themeInitScript } from "@/lib/theme";

import { CHURCH, churchSchema, defaultMetadata } from "@/config/seo";

export const viewport: Viewport = {
  // The bark toolbar everywhere, except the installed app on a phone whose
  // system is light — there the manifest's cream theme colour is what reaches
  // Android's three-button bar, and it must draw dark glyphs over Chrome's
  // light bottom band rather than white ones (they were invisible). Chrome
  // resolves the first meta whose media matches, so the order below is the
  // precedence: installed + light → cream, anything dark → bark, plain
  // browser + light → bark.
  themeColor: [
    { media: "(display-mode: standalone) and (prefers-color-scheme: light)", color: brand.sand },
    { media: "(prefers-color-scheme: dark)", color: brand.bark },
    { media: "(prefers-color-scheme: light)", color: brand.bark },
  ],
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays available (WCAG 1.4.4) — never lock maximumScale on an
  // accessibility-forward app.
  // Keep Android's Back/Home/Recents area outside the web viewport. With
  // `viewport-fit=cover`, the system controls are composited over the page,
  // which makes their background appear transparent in the installed app.
};

export const metadata: Metadata = {
  ...defaultMetadata,
  // Token-bearing pages (accept-invite, enroll confirm, password reset) read
  // their secret from the query string; never name that URL in a Referer.
  referrer: "no-referrer",
  // `app/manifest.ts` is the manifest the browser actually links (Next serves
  // it as /manifest.webmanifest and this `manifest` field is not emitted when
  // the file route exists) — but an install minted from older HTML stored
  // `public/manifest.json` with this query string, so the two manifests are
  // kept identical and this URL is what makes that older install re-read it.
  // It starts at the dashboard, so the launch entry is the floor of the app's
  // back stack. Bump the query whenever the manifest changes — and only then:
  // a new manifest URL makes Chrome re-mint the WebAPK, and its own icon
  // shows for a moment while it does.
  manifest: "/manifest.json?v=6-cream-system-bars",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: CHURCH.shortName,
  },
  icons: {
    // Brand-new file paths (not query-string versions): every cache layer
    // between the phone and the server — browser HTTP cache, Cloudflare edge,
    // Chrome's WebAPK minting server — has never seen these URLs, so a
    // reinstall is guaranteed to fetch the current Meru artwork.
    icon: [
      { url: "/icons/meru/church-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/meru/church-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/meru/church-apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // lang carries Kenya's English dialect: it also makes every native date
  // input read day-first (ddmmyyyy), the way the church writes dates.
  return (
    <html lang="en-KE" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Schema.org structured data for search engines: the church, the
            organization behind it and the site itself, as one @graph. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(churchSchema) }}
        />
        {/* Before the first paint: a member whose stored preferences say dark
            gets the dark palette on the very first frame rather than a white
            flash that the provider corrects a moment later. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Before the first paint: a signed-in member never catches a frame of
            the marketing section grids that the authenticated shell hides. */}
        <script dangerouslySetInnerHTML={{ __html: authInitScript }} />
      </head>
      <body className="h-full flex flex-col">
        <AccessibilityProvider>
          {/* Chrome is per group: the public website renders MarketingNav, and
              every signed-in page is framed by the rail (AppFrame). */}
          {children}
          <PwaRegister />
        </AccessibilityProvider>
      </body>
    </html>
  );
}
