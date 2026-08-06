"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SiteNav } from "./site-nav";

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
  return (
    <>
      <div
        className={`fixed top-0 left-0 right-0 z-[70] shadow-md transition-transform duration-300 ease-in-out ${
          !isVisible ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <SiteNav open={mobileMenuOpen} setOpen={setMobileMenuOpen} />
      </div>
      <div className="h-[73px]" />
    </>
  );
}
