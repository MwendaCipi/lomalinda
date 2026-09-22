import type { Metadata, Viewport } from "next";
import "./globals.css";
import "sweetalert2/dist/sweetalert2.min.css";
import { PwaRegister } from "@/components/pwa-register";
import { AccessibilityProvider } from "@/context/accessibility-context";

export const viewport: Viewport = {
  themeColor: "#26352f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  // Token-bearing pages (accept-invite, enroll confirm, password reset) read
  // their secret from the query string; never name that URL in a Referer.
  referrer: "no-referrer",
  title: "SDA Loma Linda",
  description: "A vibrant, English-speaking Seventh-day Adventist church in Meru, Kenya, growing in faith, hope, and love.",
  manifest: "/manifest.json?v=3-meru",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Loma Linda SDA",
  },
  icons: {
    // The ?v= query changes whenever the icon art changes: installed PWAs
    // treat a changed URL as a new icon and refresh the home-screen bitmap
    // (bumping the file alone is not enough — Android keeps the old render).
    icon: [
      { url: "/icons/icon-192x192.png?v=2-meru", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png?v=2-meru", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png?v=2-meru",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-full flex flex-col">
        <AccessibilityProvider>
          {/* Chrome is per group: the public website renders MarketingNav,
              the system area renders SiteHeader (header + mobile tab bar). */}
          {children}
          <PwaRegister />
        </AccessibilityProvider>
      </body>
    </html>
  );
}
