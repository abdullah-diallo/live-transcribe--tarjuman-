"use client";

import { useEffect, useRef } from "react";

/**
 * Holds a screen wake lock while `enabled` is true.
 *
 * The browser auto-releases the lock whenever the tab loses visibility
 * (switching apps, locking the device). When the tab becomes visible again
 * we re-acquire so the lock survives a momentary backgrounding.
 *
 * Safely no-ops on browsers without the Wake Lock API (older Safari).
 */
export function useWakeLock(enabled: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.wakeLock) return;

    const wakeLock = navigator.wakeLock;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled) return;
      if (sentinelRef.current && !sentinelRef.current.released) return;
      try {
        const sentinel = await wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
          }
        });
      } catch {
        // The browser can refuse the request (e.g., low battery). Not fatal —
        // the user just has to keep the screen awake themselves.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) {
        sentinel.release().catch(() => {});
      }
    };
  }, [enabled]);
}
