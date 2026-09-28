"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ScrollMode } from "./app-shell";
import { AboutSidebar } from "./sidebars/about-sidebar";
import { MaterialsSidebar } from "./materials-destinations";
import { SupportSidebar } from "./sidebars/support-sidebar";
import { RequestsSidebar } from "./sidebars/requests-sidebar";

export function AuthenticatedPublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem("access_token")));
  }, [pathname]);

  const showSidebar = signedIn && (
    pathname.startsWith("/about") ||
    pathname.startsWith("/materials") ||
    pathname.startsWith("/give") ||
    pathname.startsWith("/requests")
  );

  // The signed-in giving page is app-like at every width (pinned); the other
  // sidebar sections are documents on a phone and panels on desktop.
  const mode: ScrollMode = pathname.startsWith("/give") ? "pinned" : "panel";

  if (!showSidebar) {
    return <>{children}</>;
  }

  const Sidebar = pathname.startsWith("/about")
    ? AboutSidebar
    : pathname.startsWith("/materials")
      ? MaterialsSidebar
      : pathname.startsWith("/requests")
        ? RequestsSidebar
        : SupportSidebar;

  return (
    <div
      className="authenticated-public-shell app-shell flex min-h-0 flex-1 pb-24 md:overflow-hidden md:pb-0"
      data-scroll-mode={mode}
    >
      <Sidebar />
      {/* Mobile: the document itself scrolls (no internal scroller to collapse).
          Desktop: the shell is a fixed viewport and this panel scrolls. */}
      <div className="min-w-0 min-h-0 flex-1 md:h-full md:overflow-y-auto custom-hover-scrollbar">{children}</div>
    </div>
  );
}
