"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Watch a drive just after a gift, so its progress catches up on its own.
 *
 * An M-Pesa gift is only written when Safaricom's callback reaches the API —
 * seconds after the prompt — so a member who pays would otherwise stare at a
 * total that has not moved. `start()` begins watching for `windowMs`, calling
 * `refresh` on an interval and again whenever the page is looked at (the
 * moment they come back from entering their PIN, when the callback has most
 * likely landed), then stops. Calling `start()` again simply extends the watch.
 */
export function useGivingRefresh(
  refresh: () => void,
  { windowMs = 90_000, everyMs = 5_000 }: { windowMs?: number; everyMs?: number } = {}
) {
  // Keep the latest reader without restarting the interval on every render.
  // Assigned in an effect, not during render, so React's ref rules hold.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  const deadlineRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    deadlineRef.current = 0;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    if (Date.now() > deadlineRef.current) {
      stop();
      return;
    }
    refreshRef.current();
  }, [stop]);

  const start = useCallback(() => {
    deadlineRef.current = Date.now() + windowMs;
    if (timerRef.current === null) {
      timerRef.current = window.setInterval(tick, everyMs);
    }
  }, [tick, windowMs, everyMs]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [tick, stop]);

  return start;
}
