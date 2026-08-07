import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { PwaRegister } from "@/components/pwa-register";

export const viewport: Viewport = {
  themeColor: "#26352f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "SDA Church Loma Linda, Meru",
  description: "A vibrant, English-speaking Seventh-day Adventist church in Meru, Kenya, growing in faith, hope, and love.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SDA Church Loma Linda, Meru",
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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <div>{children}</div>
        <PwaRegister />
      </body>
    </html>
  );
}
