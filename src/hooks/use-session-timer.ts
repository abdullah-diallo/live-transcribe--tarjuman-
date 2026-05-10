"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Pause/resume-aware elapsed timer in seconds.
 *
 * Counts up while `active && !paused`. Freezes (does not reset) while `paused`.
 * Resets to 0 when `active` flips to false.
 *
 * Drift-resistant: the elapsed total is recomputed from `performance.now()`
 * each tick, not incremented per interval. A dropped or slow tick can't
 * accumulate error.
 */
export function useSessionTimer(active: boolean, paused: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const accumulatedRef = useRef(0);
  const runStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      accumulatedRef.current = 0;
      runStartRef.current = null;
      setElapsed(0);
      return;
    }

    if (paused) {
      // Freeze: roll the current run into the accumulator and stop ticking.
      if (runStartRef.current !== null) {
        accumulatedRef.current +=
          (performance.now() - runStartRef.current) / 1000;
        runStartRef.current = null;
      }
      setElapsed(Math.floor(accumulatedRef.current));
      return;
    }

    // Running: start (or resume) a run and tick.
    if (runStartRef.current === null) {
      runStartRef.current = performance.now();
    }
    const tick = () => {
      const start = runStartRef.current;
      if (start === null) return;
      const live = (performance.now() - start) / 1000;
      setElapsed(Math.floor(accumulatedRef.current + live));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => {
      window.clearInterval(id);
    };
  }, [active, paused]);

  return elapsed;
}
