"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Thin dotLottie player.
 *
 * ⚠️ RENDERS ITS FALLBACK UNTIL AN ASSET EXISTS. A `.lottie` is a zip around
 * Lottie JSON, normally exported from After Effects (Bodymovin) or LottieFiles.
 * Point `src` at a file under `public/animations/` and it takes over; until
 * then `fallback` renders and neither the player (~32kB gz) nor its renderer
 * WASM (~300kB) is fetched.
 *
 * WASM NOTE: by default @lottiefiles/dotlottie-web fetches its thorvg WASM from
 * LottieFiles' CDN at runtime. `setWasmUrl` below points it at our own origin
 * instead, so an animation can't be broken by a third-party CDN and no user
 * request leaks to one. Drop the matching `.wasm` next to the asset when you
 * add the first animation — until then nothing loads it either way.
 */
export function DotLottiePlayer({
  src,
  className,
  loop = false,
  autoplay = true,
  fallback,
}: {
  /** Path under /public, e.g. "/animations/upgrade-burst.lottie" */
  src: string;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  /** Rendered whenever the asset is missing or motion is reduced. */
  fallback: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Reduced motion: never fetch the player at all, just keep the fallback.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let instance: { destroy: () => void } | null = null;

    void (async () => {
      // HEAD first so a missing asset is a silent no-op rather than a console
      // error on every mount.
      try {
        const head = await fetch(src, { method: "HEAD" });
        if (!head.ok) return;
      } catch {
        return;
      }
      if (cancelled || !canvasRef.current) return;

      const { DotLottie } = await import("@lottiefiles/dotlottie-web");
      if (cancelled || !canvasRef.current) return;

      // Static on the class, not a module export.
      DotLottie.setWasmUrl("/animations/dotlottie-player.wasm");

      instance = new DotLottie({
        canvas: canvasRef.current,
        src,
        loop,
        autoplay,
      });
      setReady(true);
    })();

    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, [src, loop, autoplay]);

  return (
    <div className={className}>
      {!ready && fallback}
      <canvas
        ref={canvasRef}
        aria-hidden
        className={ready ? "h-full w-full" : "hidden"}
      />
    </div>
  );
}
