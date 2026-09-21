"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { isSystemRoute } from "@/lib/route-visibility";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Client-side gate for system pages. The page markup is prerendered as static
 * HTML (fine — no data is embedded), but interactive data fetching only starts
 * once a token exists, and signed-out visitors are bounced to /login with a
 * ?next= redirect back to the page they wanted.
 */
export function SystemGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "signed-out" | "ok">("checking");

  useEffect(() => {
    if (!isSystemRoute(pathname)) return;
    const token = localStorage.getItem("access_token");
    if (!token) {
      setStatus("signed-out");
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setStatus("ok");
  }, [pathname, router]);

  if (!isSystemRoute(pathname)) {
    // Safety net: the gate should never wrap public routes.
    return <>{children}</>;
  }

  if (status === "ok") return <>{children}</>;

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold text-[#617068]">
        {status === "checking" ? "Checking your session…" : "Taking you to sign in…"}
      </p>
      {status === "signed-out" && (
        <p className="text-xs text-[#617068]">
          Not redirected?{" "}
          <Link className="font-semibold text-[#b36b3c] hover:underline" href={`/login?next=${encodeURIComponent(pathname || "/")}`}>
            Sign in here
          </Link>
        </p>
      )}
    </main>
  );
}
