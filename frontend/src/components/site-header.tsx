"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SiteNav } from "./site-nav";
import { PopupAnnouncementModal } from "./popup-announcement-modal";

export function SiteHeader() {
  const pathname = usePathname();

  // Scroll to top automatically whenever a new page is opened
  useEffect(() => {
    if (typeof window !== "undefined" && !window.location.hash) {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return (
    <>
      <PopupAnnouncementModal />
      <SiteNav />
    </>
  );
}

