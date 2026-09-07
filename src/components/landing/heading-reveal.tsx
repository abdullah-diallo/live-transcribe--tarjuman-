"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/locale-context";
import { isRtlLocale } from "@/lib/i18n/locales";

/**
 * Word-by-word reveal for a section heading, using GSAP SplitText +
 * ScrollTrigger. Below-the-fold headings only.
 *
 * DIVISION OF LABOUR: Motion owns per-element reveals (see reveal.tsx);
 * GSAP owns text-splitting and scrub-linked effects. Two IntersectionObserver
 * systems driving the same element is how this becomes unmaintainable — so a
 * heading is wrapped in EITHER <Reveal> or <HeadingReveal>, never both. If it
 * were both, the words would animate while the block was still translating.
 *
 * NEVER use this on the hero <h1>: it's the LCP element.
 */
export function HeadingReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { locale } = useLocale();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Arabic / Urdu: never split. Word splitting is survivable but any char or
    // line splitting breaks Arabic letter joining and shaping — cheaper and
    // safer to skip entirely and let the heading render plainly.
    if (isRtlLocale(locale)) return;

    let cancelled = false;
    let mm: gsap.MatchMedia | undefined;

    void (async () => {
      // Dynamic import keeps gsap + ScrollTrigger + SplitText (~39kB gz) out
      // of the landing page's initial bundle entirely.
      const [{ gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("gsap/SplitText"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger, SplitText);

      // matchMedia is the idiomatic reduced-motion gate: the body only runs
      // under no-preference, and the returned context auto-reverts — removing
      // SplitText's wrapper spans and killing the ScrollTriggers — when the
      // query stops matching or we revert on unmount. That also makes this
      // safe under React 19 StrictMode double-mounting.
      mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const target = el.querySelector("h2");
        if (!target) return;
        const split = SplitText.create(target, {
          type: "lines,words",
          mask: "lines", // overflow-hidden line wrappers, no manual markup
          // MANDATORY here: the app loads DM Sans via next/font. Without
          // autoSplit, SplitText measures line boxes in the fallback font and
          // the mask boundaries visibly jump when the real font swaps in.
          autoSplit: true,
          aria: "auto", // original text preserved for screen readers
        });
        gsap.from(split.words, {
          yPercent: 110,
          opacity: 0,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.035,
          scrollTrigger: {
            trigger: el,
            start: "top 82%",
            // Reverses on scroll-up, matching Reveal's two-way behaviour so
            // the page reads consistently in both directions.
            toggleActions: "play none none reverse",
          },
        });
        return () => split.revert();
      });
    })();

    return () => {
      cancelled = true;
      mm?.revert();
    };
    // <T> renders English server-side then swaps to the locale on the client,
    // so the split has to be redone when the text changes underneath it.
  }, [locale]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
