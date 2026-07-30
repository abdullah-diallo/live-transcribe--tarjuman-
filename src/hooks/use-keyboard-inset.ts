"use client";

import { useEffect } from "react";

/**
 * Publishes the on-screen keyboard's height as `--kb-inset` on <html>.
 *
 * Android Chrome honours `interactiveWidget: "resizes-content"` (set in the
 * root layout's viewport export): the layout viewport shrinks, the flex column
 * shrinks with it, and the composer stays above the keyboard for free. iOS
 * Safari ignores it and scrolls the document instead, so the composer slides
 * underneath. Padding the composer by this value keeps it visible there.
 *
 * No-ops where visualViewport is absent (older browsers, SSR).
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb-inset", `${inset}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      document.documentElement.style.removeProperty("--kb-inset");
    };
  }, []);
}
