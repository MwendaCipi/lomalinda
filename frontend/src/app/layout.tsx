import type { Metadata, Viewport } from "next";
import "./globals.css";
import "sweetalert2/dist/sweetalert2.min.css";
import { SiteHeader } from "@/components/site-header";
import { PwaRegister } from "@/components/pwa-register";
import { AccessibilityProvider } from "@/context/accessibility-context";

export const viewport: Viewport = {
  themeColor: "#26352f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Loma Linda SDA Church, Meru",
  description: "A vibrant, English-speaking Seventh-day Adventist church in Meru, Kenya, growing in faith, hope, and love.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Loma Linda SDA Church, Meru",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-full flex flex-col pb-24 md:pb-0">
        <AccessibilityProvider>
          <SiteHeader />
          <div className="flex-1 min-h-0 flex flex-col">{children}</div>
          <PwaRegister />
        </AccessibilityProvider>
      </body>
    </html>
  );
}
