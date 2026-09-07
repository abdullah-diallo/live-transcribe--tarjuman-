"use client";

import { useCallback, useSyncExternalStore } from "react";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";

/**
 * Lenis smooth scrolling — MARKETING PAGE ONLY. Renders nothing itself
 * (`root` mode drives window scroll directly, no wrapper element).
 *
 * ⚠️ WHY THIS IS NOT IN THE ROOT LAYOUT, AND MUST NOT BE MOVED THERE.
 * Lenis attaches a non-passive `wheel` listener on window and calls
 * preventDefault() on it (smoothWheel defaults true). Inside the app, the live
 * transcript is an INNER overflow-y container driven by useStickyBottom. With a
 * global Lenis, a wheel over that container would scroll the PAGE instead, so
 * the container's own scroll event would never fire — which means the
 * direction-based disengage never trips, `isStuck` is pinned true forever, and
 * the "N new" jump-to-latest pill becomes dead code. Silently. No error.
 * A 40-minute lecture you cannot scroll back through is a broken product.
 *
 * `data-lenis-prevent` on individual scrollers is a defence, not a strategy —
 * it has to be maintained on every scroller anyone ever adds. Scoping the mount
 * is the actual fix.
 *
 * Also note `syncTouch` stays FALSE: it's the flag that would make Lenis eat
 * touch events too, extending the same failure to phones — which is most of
 * this app's usage.
 */
export function SmoothScroll() {
  // Not mounting at all beats Lenis's own `respectReducedMotion`, which only
  // forces lerp:1 — it still preventDefaults the wheel and still adds the
  // .lenis classes (whose `height: auto` overrides the app's `html {height:100%}`).
  //
  // useSyncExternalStore rather than useState+useEffect: the media query is an
  // external store, and this way the value is read during render instead of
  // set from an effect (no cascading render, and no flash of a Lenis-enabled
  // frame for a reduced-motion user). The server snapshot is `false` so SSR
  // renders nothing, matching the client's first paint.
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const enabled = useSyncExternalStore(
    subscribe,
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );

  if (!enabled) return null;

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.12,
        smoothWheel: true,
        syncTouch: false,
        // Replaces the CSS `scroll-padding-top: 5rem` for JS-driven anchor
        // jumps, so the sticky nav doesn't cover the target heading.
        anchors: { offset: -80 },
        stopInertiaOnNavigate: true,
      }}
    />
  );
}
