import type { Metadata, Viewport } from "next";
import "./globals.css";
import "sweetalert2/dist/sweetalert2.min.css";
import { PwaRegister } from "@/components/pwa-register";
import { AccessibilityProvider } from "@/context/accessibility-context";
import { brand } from "@/lib/brand";
import { authInitScript, themeInitScript } from "@/lib/theme";

export const viewport: Viewport = {
  themeColor: brand.bark,
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays available (WCAG 1.4.4) — never lock maximumScale on an
  // accessibility-forward app.
  // Let the tab bar extend into the gesture bar and pad with env(safe-area-inset-bottom)
  viewportFit: "cover",
};

export const metadata: Metadata = {
  // Token-bearing pages (accept-invite, enroll confirm, password reset) read
  // their secret from the query string; never name that URL in a Referer.
  referrer: "no-referrer",
  title: "SDA Loma Linda",
  description: "A vibrant, English-speaking Seventh-day Adventist church in Meru, Kenya, growing in faith, hope, and love.",
  // `public/manifest.json` is the manifest the installed app actually reads
  // (`manifest.ts` next to this file only produces an unused copy). It starts
  // at the dashboard, so the launch entry is the floor of the app's back
  // stack. The query string is the only lever for making an install re-read
  // it — bump it whenever the manifest changes.
  manifest: "/manifest.json?v=4-dashboard",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Loma Linda SDA",
  },
  icons: {
    // Brand-new file paths (not query-string versions): every cache layer
    // between the phone and the server — browser HTTP cache, Cloudflare edge,
    // Chrome's WebAPK minting server — has never seen these URLs, so a
    // reinstall is guaranteed to fetch the current Meru artwork.
    icon: [
      { url: "/icons/meru/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/meru/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/meru/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // lang carries Kenya's English dialect: it also makes every native date
  // input read day-first (dd/mm/yyyy), the way the church writes dates.
  return (
    <html lang="en-KE" className="h-full antialiased" suppressHydrationWarning>
      <head>
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
