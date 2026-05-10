"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Aggressive sticky-bottom scroll, tuned for live-transcription UX.
 *
 * Behavior:
 *   - Default state: pinned to the bottom. Every render re-snaps so a
 *     newly-arrived segment is always on screen.
 *   - Threshold for "still pinned" is wide (200px ≈ ~2 segments). A slight
 *     finger movement won't pop you out of sticky.
 *   - When the user deliberately scrolls up past the threshold to read
 *     past content, sticky disengages and stays disengaged. We expose
 *     `isStuck` + `scrollToBottom` so the caller can render a "↓ N new"
 *     pill that re-engages sticky on tap.
 *   - Smooth scroll behavior, so the auto-scroll FEELS intentional rather
 *     than a jarring snap. Modern browsers cancel chained smooth scrolls
 *     so rapid updates don't queue up.
 *
 * Why useLayoutEffect + rAF:
 *   useLayoutEffect runs after layout but BEFORE paint, with full layout
 *   info. The rAF wrap moves the scroll command to AFTER paint so any
 *   ResizeObserver / late-layout child has had a chance to settle. This
 *   matters when a new translation card mounts under a source card and
 *   pushes the previous bottom upward.
 */
export function useStickyBottom<T extends HTMLElement = HTMLDivElement>(
  threshold = 200
) {
  const scrollRef = useRef<T | null>(null);
  // Whether the user is currently pinned to the bottom. Initialized true so
  // the first render lands at the bottom, and exposed as state so the
  // caller can conditionally render the "scroll to latest" UI.
  const stickyRef = useRef(true);
  const [isStuck, setIsStuck] = useState(true);

  const updateSticky = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    const next = distanceFromBottom <= threshold;
    if (next !== stickyRef.current) {
      stickyRef.current = next;
      setIsStuck(next);
    }
  }, [threshold]);

  const onScroll = useCallback(() => updateSticky(), [updateSticky]);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    stickyRef.current = true;
    setIsStuck(true);
  }, []);

  // Snap on every render when sticky. No deps array — runs after every
  // render. The work is cheap (one scrollTo write, idempotent if already
  // there).
  useLayoutEffect(() => {
    if (!stickyRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      if (!stickyRef.current) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  });

  // Re-snap when the scroll element grows (a child resized, the keyboard
  // opened on mobile, etc.).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => {
      if (!stickyRef.current) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
    obs.observe(el);
    // Also observe the first child (the inner content), since its height
    // change is what matters for "we have new content."
    const inner = el.firstElementChild;
    if (inner) obs.observe(inner);
    return () => obs.disconnect();
  }, []);

  return {
    scrollRef,
    onScroll,
    isStuck,
    scrollToBottom,
  };
}
