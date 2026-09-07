"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import type { ReactNode } from "react";

/**
 * Motion runtime for a subtree.
 *
 * `LazyMotion` + the `m` component (instead of `motion`) keeps the ~34kB gz
 * full feature bundle out of the initial payload — `domAnimation` is a fraction
 * of that and covers everything used here (variants, whileInView, gestures).
 * Anything needing shared-element `layoutId` requires `domMax`; those few call
 * sites import the plain `motion` component directly instead of widening this
 * bundle for the whole app.
 *
 * `reducedMotion="user"` makes transform/layout animations honour the OS
 * setting globally. Components that must not merely be reduced but must not
 * TOGGLE at all (e.g. Reveal's two-way scroll observer) still check
 * `useReducedMotion()` themselves — see the comment in reveal.tsx.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
