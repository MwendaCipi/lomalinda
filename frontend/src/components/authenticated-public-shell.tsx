"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AboutSidebar } from "./sidebars/about-sidebar";
import { MaterialsSidebar } from "./sidebars/materials-sidebar";
import { SupportSidebar } from "./sidebars/support-sidebar";

export function AuthenticatedPublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem("access_token")));
  }, [pathname]);

  const showSidebar = signedIn && (
    pathname.startsWith("/about") ||
    pathname.startsWith("/materials") ||
    pathname.startsWith("/give")
  );

  if (!showSidebar) {
    return <>{children}</>;
  }

  const Sidebar = pathname.startsWith("/about")
    ? AboutSidebar
    : pathname.startsWith("/materials")
      ? MaterialsSidebar
      : SupportSidebar;

  return (
    <div className="authenticated-public-shell app-shell flex min-h-0 flex-1 overflow-hidden pb-24 md:pb-0">
      <Sidebar />
      <div className="min-w-0 min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar">{children}</div>
    </div>
  );
}
