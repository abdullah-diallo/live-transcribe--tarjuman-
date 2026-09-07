"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scroll-scrubbed parallax for the hero backdrop.
 *
 * ⚠️ WHY THIS IS A WRAPPER AND NOT APPLIED TO `.hero-glow` ITSELF.
 * `.hero-glow` already carries a running CSS animation (`hero-glow-drift`)
 * that animates `transform`. A running CSS animation beats an inline style for
 * the same property, so GSAP writing `y`/`scale` onto that element would
 * silently do nothing (or fight the keyframe). Parallaxing an OUTER element
 * composes cleanly with the inner drift, and leaves `.hero-glow` as the
 * complete no-JS / reduced-motion presentation.
 *
 * The trigger is the hero section (the wrapper's own parent), scrubbed rather
 * than played, so it tracks the scroll position instead of running on its own
 * clock. Deliberately subtle — this should read as depth, not as an effect.
 */
export function HeroParallax({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    let mm: gsap.MatchMedia | undefined;

    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      // Auto-reverting context: clears the inline transform and kills the
      // trigger when reduced-motion turns on or the component unmounts.
      mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to(el, {
          yPercent: 18,
          scale: 1.06,
          ease: "none",
          scrollTrigger: {
            trigger: el.parentElement ?? el,
            start: "top top",
            end: "bottom top",
            scrub: 0.6,
          },
        });
      });
    })();

    return () => {
      cancelled = true;
      mm?.revert();
    };
  }, []);

  // `absolute inset-0` is load-bearing, not cosmetic: once GSAP writes a
  // transform here this element becomes the containing block for its
  // absolutely-positioned children. Sizing it to exactly cover the (relative)
  // hero section means the glow's `left-1/2 top-1/3` resolves against the same
  // box it always did. A zero-height static wrapper would have collapsed the
  // glow into the top-left corner the moment the scrub started.
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
    >
      {children}
    </div>
  );
}
