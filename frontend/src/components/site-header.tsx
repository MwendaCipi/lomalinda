"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SiteNav } from "./site-nav";
import { AnnouncementBanner } from "./announcements";

export function SiteHeader() {
  const pathname = usePathname();
  const [headerVisible, setHeaderVisible] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Scroll to top automatically whenever a new page is opened
  useEffect(() => {
    if (typeof window !== "undefined" && !window.location.hash) {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY <= 15) {
        setHeaderVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setHeaderVisible(false);
      } else if (currentScrollY < lastScrollY) {
        setHeaderVisible(true);
      }

      lastScrollY = currentScrollY;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScroll);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isVisible = headerVisible || mobileMenuOpen;
  const normalizedPath = (pathname ?? "").toLowerCase().replace(/\/$/, "");
  const isAuthOrMember =
    normalizedPath === "/login" ||
    normalizedPath.startsWith("/login/") ||
    normalizedPath === "/member" ||
    normalizedPath.startsWith("/member/") ||
    normalizedPath === "/enroll" ||
    normalizedPath.startsWith("/enroll/") ||
    normalizedPath === "/forgot-password" ||
    normalizedPath === "/reset-password";

  // Hide the announcement banner on all pages that have forms, to avoid distraction
  const isFormPage =
    normalizedPath.startsWith("/support/financial") ||
    normalizedPath.startsWith("/support/in-kind") ||
    normalizedPath.startsWith("/support/budget") ||
    normalizedPath.startsWith("/support/reports") ||
    normalizedPath.startsWith("/support/prayers") ||
    normalizedPath.startsWith("/support/ideas") ||
    normalizedPath.startsWith("/community/prayer") ||
    normalizedPath.startsWith("/community/visitation") ||
    normalizedPath.startsWith("/community/child-dedication") ||
    normalizedPath.startsWith("/community/testimonies") ||
    normalizedPath.startsWith("/community/welfare") ||
    normalizedPath.startsWith("/spiritual/prayer") ||
    normalizedPath.startsWith("/spiritual/visitation") ||
    normalizedPath.startsWith("/spiritual/child-dedication") ||
    normalizedPath.startsWith("/spiritual/testimonies") ||
    normalizedPath.startsWith("/share/moments") ||
    normalizedPath.startsWith("/share/services") ||
    normalizedPath.startsWith("/administration");

  return (
    <>
      <div
        className={`fixed top-0 left-0 right-0 z-[70] shadow-md transition-transform duration-300 ease-in-out ${
          !isVisible
            ? isAuthOrMember
              ? "-translate-y-full"
              : "-translate-y-[73px]"
            : "translate-y-0"
        }`}
      >
        <SiteNav open={mobileMenuOpen} setOpen={setMobileMenuOpen} />
        {!isAuthOrMember && !isFormPage && <AnnouncementBanner />}
      </div>
      <div className={isAuthOrMember || isFormPage ? "h-[73px]" : "h-[142px] sm:h-[115px]"} />
    </>
  );
}
