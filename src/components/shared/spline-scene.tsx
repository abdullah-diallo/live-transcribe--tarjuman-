"use client";

import dynamic from "next/dynamic";
import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * Spline 3D scene embed.
 *
 * ⚠️ RENDERS ITS POSTER UNTIL YOU CLICK, AND ONLY ON DESKTOP.
 *
 * Read this before using it anywhere: `@splinetool/runtime` is ~34 MB unpacked
 * and a typical exported scene adds another 1-5 MB on top. This is a
 * mobile-first app whose entire value is a transcript that doesn't stutter
 * during a khutbah, so a Spline scene must never sit on a default load path.
 * Hence three hard gates, all of them deliberate:
 *   1. Marketing routes only — never inside (app).
 *   2. Desktop only (`(hover: none)` and low-core devices are excluded).
 *   3. Explicit click-to-load. Nothing is fetched until the visitor asks.
 *
 * `scene` is a Spline-published .splinecode URL, authored in the Spline editor.
 * Until you have one, this renders `poster` and imports nothing.
 */

const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
  loading: () => null,
});

export function SplineScene({
  scene,
  className,
  poster,
  loadLabel = "Load 3D scene",
}: {
  /** Published Spline scene URL (.splinecode). */
  scene: string;
  className?: string;
  /** Shown until the visitor opts in. Should look complete on its own. */
  poster: ReactNode;
  loadLabel?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  // Read during render from the media queries rather than setting state in an
  // effect — same pattern as landing/smooth-scroll.tsx. Server snapshot is
  // false, so SSR emits the poster with no load button and the client agrees
  // on first paint.
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const eligible = useSyncExternalStore(
    subscribe,
    () =>
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      !window.matchMedia("(hover: none)").matches &&
      (navigator.hardwareConcurrency ?? 8) > 4,
    () => false
  );

  if (loaded) {
    return (
      <div className={className}>
        <Spline scene={scene} />
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      {poster}
      {eligible && (
        <button
          type="button"
          onClick={() => setLoaded(true)}
          className="absolute bottom-3 end-3 rounded-full px-3 py-1.5 text-[12px] font-semibold cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95"
          style={{
            background: "rgba(20, 28, 46, 0.6)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            color: "var(--color-text-1)",
          }}
        >
          {loadLabel}
        </button>
      )}
    </div>
  );
}
