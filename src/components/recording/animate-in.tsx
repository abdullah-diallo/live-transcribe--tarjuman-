"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { animate } from "motion/mini";

/**
 * Entrance for a transcript / translation message. Each message rises + fades
 * + un-blurs into place the moment it mounts (a new final segment, or a
 * translation landing), so the live transcript feels alive instead of popping.
 *
 * Uses `motion/mini` (~2.6kB, WAAPI-backed) rather than a JS-driven tween
 * library: opacity/transform go to the COMPOSITOR, off the main thread. That
 * matters here specifically — during a session the main thread is already
 * running the STT WebSocket, streaming translation, and useStickyBottom's
 * per-frame scroll math, for 30-40 minutes straight.
 *
 * CRITICAL-PATH SAFETY: the transcript must NEVER be left invisible. So:
 *  - reduced-motion → show instantly, no animation;
 *  - a single `finalize()` forces the element fully visible and runs on EVERY
 *    exit path — success, cancel, throw, and unmount;
 *  - `animate` is statically imported (bundled), so it's always present at
 *    runtime — no dynamic-load failure mode.
 * The element starts at opacity:0 only for the sub-frame before the mount
 * effect runs; if that effect somehow never runs, a normally-mounted client
 * component doesn't hit this path.
 */
export function AnimateIn({
  children,
  className,
  style,
  variant = "source",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Slightly different motion for the source vs its translation. */
  variant?: "source" | "translation";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // The one place visibility is guaranteed. Idempotent and cheap, so it is
    // safe to call from several exit paths on the same mount.
    const finalize = () => {
      const node = ref.current;
      if (!node) return;
      node.style.opacity = "1";
      node.style.transform = "none";
      node.style.willChange = "auto";
    };

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      finalize();
      return;
    }

    // Promote to its own layer ONLY for the duration of the entrance, then
    // release it. Leaving `will-change` on permanently (it used to live in the
    // static style) accumulates hundreds of GPU-backed layers over a 30-40min
    // lecture, which degrades scroll/compositing and climbs GPU memory —
    // especially on mobile Safari. Cleared via the settle handler + a timeout
    // backstop.
    el.style.willChange = "opacity, transform";
    const clearHint = window.setTimeout(finalize, 800);

    let controls: ReturnType<typeof animate> | undefined;
    try {
      // opacity is what guarantees visibility — kept dead-simple. y + a whisper
      // of scale give the premium "rise into place" feel.
      // NOTE: durations are SECONDS here (they were milliseconds under
      // anime.js), and the transform key is `y`, not `translateY`.
      controls = animate(
        el,
        {
          opacity: [0, 1],
          y: variant === "source" ? [14, 0] : [10, 0],
          // The translation variant deliberately has no scale channel — it
          // used to animate scale:[1,1], a no-op that cost a transform channel.
          ...(variant === "source" ? { scale: [0.985, 1] } : {}),
        },
        {
          duration: variant === "source" ? 0.62 : 0.52,
          // anime.js `out(3)` was 1-(1-t)^3 — plain easeOutCubic.
          ease: [0.33, 1, 0.68, 1],
        }
      );
      // Settle both ways: `then` rejects if the animation is cancelled.
      controls.then(finalize, finalize);
    } catch {
      // Animation failed — never leave the message hidden.
      finalize();
    }

    return () => {
      window.clearTimeout(clearHint);
      controls?.stop();
      finalize();
    };
  }, [variant]);

  return (
    <div ref={ref} className={className} style={{ opacity: 0, ...style }}>
      {children}
    </div>
  );
}
