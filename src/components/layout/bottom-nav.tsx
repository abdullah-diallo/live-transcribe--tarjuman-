"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
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
    id: "ask",
    icon: "chat",
    labelKey: "nav.ask",
    href: "/ask",
    // MUST cover sub-routes. Without the prefix, a future /ask/[chatId] makes
    // findIndex return -1, Math.max(..., 0) clamps it to 0, and the lens flies
    // back to Record while the user is sitting in a conversation.
    matches: (p) => p === "/ask" || p.startsWith("/ask/"),
  },
  {
    id: "history",
    icon: "history",
    labelKey: "nav.history",
    href: "/history",
    matches: (p) => p === "/history" || p.startsWith("/session/"),
  },
];

// Fixed slot width so the lens position is just index × width. Everything else
// in this file (lens width, resting transform, flight from/to, the mid-flight
// swell) is derived from it — change only this constant.
//
// 92, not 100, now that there are three tabs: 3 × 92 = 276 content + 10 padding
// + 2 border = 288px outer, leaving 43.5px of gutter per side at 375px, 36px at
// 360px, and 16px at 320px. At 100 the capsule would be 312px wide, i.e. 4px of
// gutter on a 320px viewport — which reads as broken and can clip under
// safe-area rounding. 92 still leaves ~84px of label room after px-1, about 14
// characters at 11px semibold, which fits every curated locale.
const TAB_WIDTH = 92;
// The lens sits 4px inside the capsule while the tab row sits 5px inside —
// the lens reads slightly larger than its slot, like iOS 26's selection
// lozenge that nearly fills the bar's height.
const LENS_INSET = 4;
const FLIGHT_MS = 480;

export function BottomNav() {
  const pathname = usePathname();
  const { hidden } = useNavVisibility();
  const { t } = useLocale();
  const activeIndex = Math.max(
    TABS.findIndex((t) => t.matches(pathname)),
    0
  );
  const lensRef = useRef<HTMLDivElement>(null);
  const prevIndexRef = useRef(activeIndex);
  // Live x captured by the previous flight's cleanup just before cancel —
  // lets a rapid double-tap interrupt glide from wherever the lens actually
  // is. null = no interrupt, start from the previous slot.
  const liveXRef = useRef<number | null>(null);

  // Liquid-glass flight: when the active tab changes, the lens swells
  // slightly into a bubble, glides to the new slot (icons it passes soften
  // behind a plain backdrop blur via .nav-lens-flying), and settles back
  // down. WAAPI owns ALL lens motion; the inline resting transform below is
  // what non-animated renders (first paint, reduced motion, JS failure)
  // display.
  useEffect(() => {
    const lens = lensRef.current;
    const from = prevIndexRef.current;
    prevIndexRef.current = activeIndex;
    if (!lens || from === activeIndex) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // CAREFUL: by the time this effect runs, React has already re-rendered
    // and the inline resting transform points at the NEW slot — reading
    // computed style here would return the destination and the flight would
    // teleport-then-bulge. Start from the previous slot instead, or from the
    // live mid-flight position captured by the prior cleanup on interrupt.
    const fromX = liveXRef.current ?? from * TAB_WIDTH;
    liveXRef.current = null;
    const toX = activeIndex * TAB_WIDTH;

    lens.classList.add("nav-lens-flying");
    const anim = lens.animate(
      [
        { transform: `translateX(${fromX}px) scale(1, 1)` },
        {
          // Gentle swell at mid-flight — just enough to read as a bubble
          // lifting off, slightly past the capsule edge (the nav
          // deliberately does NOT clip overflow). Anything bigger reads
          // cartoonish.
          transform: `translateX(${(fromX + toX) / 2}px) scale(1.07, 1.14)`,
          offset: 0.4,
        },
        {
          transform: `translateX(${toX}px) scale(1.03, 1.06)`,
          offset: 0.82,
        },
        { transform: `translateX(${toX}px) scale(1, 1)` },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.3, 0.9, 0.4, 1)" }
    );
    const land = () => lens.classList.remove("nav-lens-flying");
    anim.onfinish = land;
    return () => {
      // If a flight is still in progress, capture its live position BEFORE
      // cancel so the interrupting flight takes over seamlessly. When the
      // flight already finished, computed style equals the (already
      // re-rendered) NEW destination — capturing it would recreate the
      // teleport bug, so only capture while running.
      if (anim.playState === "running") {
        liveXRef.current = new DOMMatrixReadOnly(
          getComputedStyle(lens).transform
        ).m41;
      }
      anim.cancel();
      land();
    };
  }, [activeIndex]);

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
      <div
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
          // Resting position; WAAPI animates over this during flight.
          transform: `translateX(${activeIndex * TAB_WIDTH}px)`,
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
