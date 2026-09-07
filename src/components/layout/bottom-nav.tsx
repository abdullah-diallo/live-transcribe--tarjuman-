"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  m,
  useSpring,
  useVelocity,
  useTransform,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
import { Icon, IconName } from "@/components/shared/icon";
import { useNavVisibility } from "@/components/layout/nav-visibility";
import { COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/locale-context";
import type { MessageKey } from "@/lib/i18n/messages";

const TABS: { id: string; icon: IconName; labelKey: MessageKey; href: string; matches: (p: string) => boolean }[] = [
  {
    id: "record",
    icon: "mic",
    labelKey: "nav.record",
    href: "/record",
    matches: (p) => p === "/record",
  },
  {
    id: "history",
    icon: "history",
    labelKey: "nav.history",
    href: "/history",
    matches: (p) => p === "/history" || p.startsWith("/session/"),
  },
];

// Fixed slot width so the lens position is just index × width. Fits both
// 11px-semibold labels with the same side padding the old px-7 tabs produced
// (~100px rendered). Revisit if a label changes or a third tab is added.
const TAB_WIDTH = 100;
// The lens sits 4px inside the capsule while the tab row sits 5px inside —
// the lens reads slightly larger than its slot, like iOS 26's selection
// lozenge that nearly fills the bar's height.
const LENS_INSET = 4;
// Peak |velocity| a one-slot hop reaches, px/s. Normalises the swell so a
// single-tab flight peaks at ~1.0 and a longer hop doesn't over-inflate.
const PEAK_V = 420;

export function BottomNav() {
  const pathname = usePathname();
  const { hidden } = useNavVisibility();
  const { t } = useLocale();
  const activeIndex = Math.max(
    TABS.findIndex((t) => t.matches(pathname)),
    0
  );
  const lensRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;

  // Liquid-glass flight: when the active tab changes the lens swells slightly
  // into a bubble, glides to the new slot (icons it passes soften behind a
  // plain backdrop blur via .nav-lens-flying), and settles back down.
  //
  // THE SPRING IS THE SOURCE OF TRUTH for lens position — not the DOM. That
  // single fact removes two hand-rolled hacks this file used to carry:
  //   1. Interrupt-resume. `x.set(target)` on a spring retargets from the
  //      current value AND the current velocity. The old code captured the
  //      live x off a DOMMatrix in the effect cleanup, which recovered
  //      position but threw velocity away — so a fast double-tap restarted
  //      from a dead stop. A spring is continuous through the interrupt.
  //   2. The "React already re-rendered, so computed style points at the
  //      DESTINATION" teleport-then-bulge trap. There is no computed style to
  //      misread now, so the trap can't happen.
  // The spring also initialises AT the resting slot, so the very first render
  // emits the correct transform — first paint / JS-failure correctness holds
  // by construction rather than via a parallel inline-style code path.
  const x = useSpring(activeIndex * TAB_WIDTH, {
    visualDuration: 0.42,
    bounce: 0.16, // restraint: reads as a settle, not a boing
  });

  useEffect(() => {
    const target = activeIndex * TAB_WIDTH;
    // jump() sets without animating AND without generating velocity.
    if (reduce) x.jump(target);
    else x.set(target);
  }, [activeIndex, reduce, x]);

  // Velocity-derived swell: the lens inflates in proportion to how fast it is
  // actually moving and deflates as it lands, instead of a fixed mid-flight
  // keyframe. Peaks slightly past the capsule edge (the nav deliberately does
  // NOT clip overflow); anything bigger reads cartoonish.
  const speed = useVelocity(x);
  const swell = useTransform(speed, (v) => Math.min(Math.abs(v) / PEAK_V, 1));
  const scaleX = useTransform(swell, [0, 1], [1, 1.07]);
  const scaleY = useTransform(swell, [0, 1], [1, 1.14]);

  // Direct classList write, no React state — this fires per frame, so a
  // setState here would re-render the whole nav 60x/sec during a flight.
  useMotionValueEvent(speed, "change", (v) => {
    lensRef.current?.classList.toggle("nav-lens-flying", Math.abs(v) > 8);
  });

  return (
    <nav
      aria-hidden={hidden}
      className="fixed left-1/2 z-50 flex items-center lg:hidden"
      style={{
        // Centered via inline transform (so the hide-slide can compose with
        // it); slides down + fades out when a page asks to hide the nav, e.g.
        // the record screen during an active session.
        transform: `translateX(-50%) translateY(${
          hidden ? "calc(100% + 28px)" : "0px"
        })`,
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
        transition:
          "transform 320ms cubic-bezier(0.4, 0, 0.2, 1), opacity 320ms ease",
        // Floats above the bottom edge — the safe-area inset lifts the whole
        // capsule rather than padding its inside.
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        // Liquid glass: translucent tint over a heavy frosted backdrop.
        // Same material values as the language-picker / positioning-tips
        // sheets so every glass surface in the app matches.
        background: "rgba(20, 28, 46, 0.6)",
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        borderRadius: 9999,
        border: "1px solid rgba(255, 255, 255, 0.1)",
        // Free-floating capsule: drop shadow falls downward, plus the same
        // top catch-light / bottom shade pair as the glass modals.
        boxShadow:
          "0 12px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.25)",
        padding: 5,
      }}
    >
      {/* The selection lens. Sits ABOVE the tabs (pointer-events-none) so
          that mid-flight the icons it passes soften behind the glass
          (.nav-lens-flying adds a plain backdrop blur — works everywhere);
          at rest it's a neutral smoked-glass lozenge — brand color stays on
          the active icon/label, not the glass. */}
      <m.div
        ref={lensRef}
        aria-hidden
        className="absolute z-20 pointer-events-none will-change-transform"
        style={{
          top: LENS_INSET,
          bottom: LENS_INSET,
          left: LENS_INSET,
          width: TAB_WIDTH + 2 * (5 - LENS_INSET),
          borderRadius: 9999,
          // Smoked glass, one step lighter than the capsule, with a
          // specular top rim and soft underside shade.
          background: "rgba(255, 255, 255, 0.08)",
          boxShadow:
            "inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -1px 1px rgba(0, 0, 0, 0.25), 0 2px 10px rgba(0, 0, 0, 0.25)",
          // MotionValues write straight to transform every frame.
          x,
          scaleX,
          scaleY,
        }}
      />
      {TABS.map((tab) => {
        const active = tab.matches(pathname);
        const color = active ? COLORS.accent : COLORS.t2;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "relative z-10 flex flex-col items-center gap-[3px] py-[7px] rounded-full",
              // Press feedback only — colors crossfade on the children, so
              // the two transitions don't fight on one element.
              "transition-transform duration-150 active:scale-95"
            )}
            style={{ width: TAB_WIDTH }}
          >
            <Icon
              name={tab.icon}
              size={22}
              color={color}
              className="transition-colors duration-200"
            />
            <span
              className="text-[11px] font-semibold transition-colors duration-200 w-full text-center truncate px-1"
              style={{ color }}
            >
              {t(tab.labelKey)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
