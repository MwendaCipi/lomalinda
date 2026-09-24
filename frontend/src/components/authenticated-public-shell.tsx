"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
    <div className="authenticated-public-shell app-shell flex min-h-0 flex-1 pb-24 md:overflow-hidden md:pb-0">
      <Sidebar />
      {/* Mobile: the document itself scrolls (no internal scroller to collapse).
          Desktop: the shell is a fixed viewport and this panel scrolls. */}
      <div className="min-w-0 min-h-0 flex-1 md:h-full md:overflow-y-auto custom-hover-scrollbar">{children}</div>
    </div>
  );
}
