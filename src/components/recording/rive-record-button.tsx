"use client";

import { useEffect, useRef, useState } from "react";
import type { Rive } from "@rive-app/canvas";

/**
 * Rive-driven face for the idle record button.
 *
 * ⚠️ THIS RENDERS ITS FALLBACK UNTIL AN ASSET EXISTS. Rive animations are
 * authored in the Rive editor and exported as a `.riv` binary — there is no way
 * to synthesise one in code. Until `public/animations/record-button.riv` is
 * dropped in, `RecordButtonArt` renders `fallback` (the current gradient +
 * mic icon) and nothing is downloaded beyond this component.
 *
 * ── ASSET CONTRACT (hand this to whoever authors the .riv) ──────────────────
 *   artboard:      "RecordButton"
 *   state machine: "State"
 *   inputs:
 *     state    number   0 = idle, 1 = recording, 2 = paused, 3 = stopping
 *     level    number   0..1, audio RMS — lets the button breathe with the
 *                       room instead of on a fixed clock
 *     reduced  boolean  true → hold a static frame (prefers-reduced-motion)
 *   canvas:        square, transparent background, 120x120 design size
 *
 * One asset would then replace the several hand-written CSS animations in
 * globals.css (.rec-ctl*) and give the recording state a single visual voice.
 */

const ASSET = "/animations/record-button.riv";

export function RiveRecordButton({
  state,
  level = 0,
  className,
  fallback,
}: {
  /** 0 idle · 1 recording · 2 paused · 3 stopping */
  state: 0 | 1 | 2 | 3;
  /** Audio RMS, 0..1. Drives the breathing input. */
  level?: number;
  className?: string;
  /** Rendered whenever the asset is missing or motion is reduced. */
  fallback: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const riveRef = useRef<Rive | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let instance: Rive | null = null;

    void (async () => {
      // HEAD first: a 404 would otherwise surface as a Rive console error on
      // every mount, and this component's whole contract is "silently fall
      // back until the designer ships the file".
      try {
        const head = await fetch(ASSET, { method: "HEAD" });
        if (!head.ok) return;
      } catch {
        return;
      }
      if (cancelled || !canvasRef.current) return;

      // Dynamic import so @rive-app/canvas (~98kB gz + WASM) is never in the
      // bundle for users who don't have the asset.
      const { Rive: RiveCtor } = await import("@rive-app/canvas");
      if (cancelled || !canvasRef.current) return;

      instance = new RiveCtor({
        src: ASSET,
        canvas: canvasRef.current,
        artboard: "RecordButton",
        stateMachines: "State",
        autoplay: true,
        onLoad: () => {
          if (cancelled) return;
          riveRef.current = instance;
          setReady(true);
        },
        onLoadError: () => {
          /* malformed or renamed asset — stay on the fallback */
        },
      });
    })();

    return () => {
      cancelled = true;
      instance?.cleanup();
      riveRef.current = null;
    };
  }, []);

  // Push app state into the state machine. Guarded on every lookup: an asset
  // whose inputs were renamed must degrade quietly, not throw on the recording
  // screen.
  useEffect(() => {
    const rive = riveRef.current;
    if (!ready || !rive) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      const inputs = rive.stateMachineInputs("State");
      const set = (name: string, value: number | boolean) => {
        const input = inputs?.find((i) => i.name === name);
        if (input) input.value = value;
      };
      set("state", state);
      set("level", Math.max(0, Math.min(1, level)));
      set("reduced", reduce);
    } catch {
      /* keep the transport running; the art is decorative */
    }
  }, [ready, state, level]);

  return (
    <div className={className}>
      {/* The fallback stays mounted until Rive has actually painted, so there
          is never an empty box. */}
      {!ready && fallback}
      <canvas
        ref={canvasRef}
        aria-hidden
        width={240}
        height={240}
        className={ready ? "h-full w-full" : "hidden"}
      />
    </div>
  );
}
