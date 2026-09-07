"use client";

import { m, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Stagger delay in ms before this element animates. */
  delay?: number;
  className?: string;
  /**
   * false = transform-only (opacity stays 1). Use for above-the-fold content
   * so a fade-in doesn't delay Largest Contentful Paint. Default true.
   */
  fade?: boolean;
}

const SMOOTH = [0.22, 1, 0.36, 1] as const;
const OVERSHOOT = [0.34, 1.4, 0.64, 1] as const; // slight "pop" on entrance

/**
 * Reveals its children when they scroll into view (punchy rise + slight scale +
 * gentle overshoot) AND re-hides them when they scroll back out — so the
 * animation reverses on scroll-up. `fade={false}` keeps opacity at 1 (LCP-safe)
 * for above-the-fold content. Respects prefers-reduced-motion (shows instantly,
 * no toggling). Content is only opacity/transform-shifted — never removed from
 * the DOM — so it stays crawlable.
 *
 * Uses `m` (not `motion`) — the tree-shakeable component that needs a
 * LazyMotion ancestor. See MotionProvider in src/components/providers. The full
 * `motion` component is ~34kB gz and this wraps most of the LCP surface.
 */
export function Reveal({ children, delay = 0, className, fade = true }: RevealProps) {
  // Can be null before hydration — treat that as "no preference".
  const reduce = useReducedMotion() ?? false;

  // The transition lives INSIDE each variant, not on the element. A shared
  // `transition` prop would apply to both directions and we'd lose the
  // asymmetry: entrance staggers and overshoots, exit is snappy with NO
  // stagger delay so elements hide in step with scroll-up instead of lingering
  // behind the entrance timing.
  const variants: Variants = {
    hidden: {
      opacity: fade ? 0 : 1,
      y: 28,
      scale: 0.96,
      transition: {
        opacity: { duration: 0.28, ease: SMOOTH, delay: 0 },
        default: { duration: 0.32, ease: SMOOTH, delay: 0 },
      },
    },
    shown: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        opacity: { duration: 0.6, ease: SMOOTH, delay: delay / 1000 },
        default: { duration: 0.6, ease: OVERSHOOT, delay: delay / 1000 },
      },
    },
  };

  return (
    <m.div
      className={className}
      variants={variants}
      // Reduced motion: pin to `shown` and never observe. Relying on
      // MotionConfig reducedMotion="user" alone is NOT enough — it would still
      // toggle back to `hidden` on scroll-out and flicker the content.
      initial={reduce ? "shown" : "hidden"}
      {...(reduce ? {} : { whileInView: "shown" as const })}
      // once:false keeps observing, so the reveal reverses on scroll-up.
      // amount/margin map 1:1 onto the old threshold 0.12 / rootMargin.
      viewport={{ once: false, amount: 0.12, margin: "0px 0px -8% 0px" }}
      style={{ willChange: fade ? "opacity, transform" : "transform" }}
    >
      {children}
    </m.div>
  );
}
