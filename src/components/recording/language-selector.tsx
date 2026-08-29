"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import { getLangName } from "@/lib/utils";
import { Icon } from "@/components/shared/icon";
import { LanguagePickerSheet } from "./language-picker-sheet";

interface LanguageSelectorProps {
  sourceLang: string;
  targetLang: string;
  onChange: (next: { sourceLang: string; targetLang: string }) => void;
}

/** How long the outgoing language name takes to fade away before the incoming
 *  one starts arriving. Kept short — this is a hand-off, not a scene change. */
const VALUE_OUT_MS = 150;

/**
 * One language tile ("Listening to" / "Translate to"). The border is set inline
 * (so a Tailwind `hover:` class can't win over it), so the hover state is driven
 * in JS: on hover the outline turns accent-green and gains a soft green glow —
 * matching the app's "green glow + outline" hover language. pointerenter/leave
 * fire on touch too, so mobile gets the same tap feedback.
 *
 * `slide` is the direction the OTHER tile lies in (+1 = to the right, -1 = to
 * the left). The value leaves toward that side and the replacement arrives from
 * that same side, so on a swap the two names read as crossing over each other
 * rather than blinking in place.
 */
function LangButton({
  label,
  value,
  slide,
  reduceMotion,
  onClick,
}: {
  label: string;
  value: string;
  slide: 1 | -1;
  reduceMotion: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);

  // `shown` lags `value` by one fade. `away` is DERIVED from the two being out
  // of step rather than being its own state — so a second swap mid-flight (which
  // reverts `value` back to `shown`) simply settles the name back in place
  // instead of stranding it at opacity 0.
  const [shown, setShown] = useState(value);
  const away = shown !== value;

  useEffect(() => {
    if (value === shown) return;
    // Deferred rather than set synchronously even at 0ms, so this never fires a
    // setState directly inside the effect body.
    const t = window.setTimeout(
      () => setShown(value),
      reduceMotion ? 0 : VALUE_OUT_MS
    );
    return () => window.clearTimeout(t);
  }, [value, shown, reduceMotion]);

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      className="flex-1 px-4 py-4 rounded-2xl text-left cursor-pointer"
      style={{
        background: COLORS.surfaceLight,
        border: `1px solid ${hover ? COLORS.accent : COLORS.borderLight}`,
        boxShadow: hover
          ? `0 0 0 1px ${COLORS.accent}, 0 8px 28px rgba(46,204,113,0.22)`
          : "0 0 0 rgba(0,0,0,0)",
        transition:
          "border-color 220ms ease, box-shadow 220ms ease, background 220ms ease",
      }}
    >
      <div className="section-label mb-1">{label}</div>
      {/* Only the value animates — the "Listening to" / "Translate to" label is
          a fixed property of the tile and stays put. */}
      <div
        className="text-[15px] font-bold"
        style={{
          color: COLORS.w,
          opacity: away ? 0 : 1,
          transform: away ? `translateX(${slide * 14}px)` : "translateX(0)",
          transition: reduceMotion
            ? "none"
            : away
              ? `opacity ${VALUE_OUT_MS}ms ease-in, transform ${VALUE_OUT_MS}ms ease-in`
              : "opacity 260ms ease-out, transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {shown}
      </div>
    </button>
  );
}

export function LanguageSelector({
  sourceLang,
  targetLang,
  onChange,
}: LanguageSelectorProps) {
  const [pickerOpen, setPickerOpen] = useState<"source" | "target" | null>(null);
  // Swap-button micro-interaction: spin the ↔ a full turn on hover/swap, and
  // warm the button from cool green → amber while hovered/pressed.
  const [spin, setSpin] = useState(0); // accumulated degrees
  const [warm, setWarm] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onMq = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  // Full 360° turn each spin. The ↔ icon is symmetric under 180°, so a half
  // turn would look static — a full turn reads as a clear rotation.
  const spinOnce = () => setSpin((d) => d + 360);

  const handleSwap = () => {
    spinOnce();
    onChange({ sourceLang: targetLang, targetLang: sourceLang });
  };

  return (
    <div
      className="rounded-[24px] p-6 flex items-center gap-3"
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
      }}
    >
      {/* Source */}
      <LangButton
        label="Listening to"
        value={getLangName(sourceLang)}
        slide={1}
        reduceMotion={reduceMotion}
        onClick={() => setPickerOpen("source")}
      />

      {/* Swap — warms cool green → amber and spins the ↔ a full turn on hover,
          then unwinds it back on leave; each swap adds another turn. On touch,
          pointerenter/leave fire on tap, so mobile gets the warm flash + spin
          too. Icon uses currentColor so its stroke transitions with the
          button's color. */}
      <button
        type="button"
        onClick={handleSwap}
        onPointerEnter={() => setWarm(true)}
        onPointerLeave={() => setWarm(false)}
        aria-label="Swap source and target languages"
        className="w-10 h-10 rounded-2xl grid place-items-center cursor-pointer flex-shrink-0"
        style={{
          background: warm ? COLORS.amberSoft : COLORS.accentSoft,
          border: `1px solid ${warm ? COLORS.amber : COLORS.accent}30`,
          color: warm ? COLORS.amber : COLORS.accent,
          boxShadow: warm ? `0 0 16px ${COLORS.amber}55` : "0 0 0 rgba(0,0,0,0)",
          transform: warm && !reduceMotion ? "scale(1.06)" : "scale(1)",
          transition: reduceMotion
            ? "none"
            : "background 300ms ease, border-color 300ms ease, color 300ms ease, box-shadow 300ms ease, transform 200ms ease",
        }}
      >
        <span
          className="grid place-items-center"
          style={{
            // Outer: winds in on hover (0→360) and unwinds back on leave (360→0).
            transform: reduceMotion ? undefined : `rotate(${warm ? 360 : 0}deg)`,
            transition: reduceMotion
              ? "none"
              : "transform 500ms cubic-bezier(0.22, 1.2, 0.36, 1)",
          }}
        >
          <span
            className="grid place-items-center"
            style={{
              // Inner: an extra full turn on each swap-click.
              transform: reduceMotion ? undefined : `rotate(${spin}deg)`,
              transition: reduceMotion
                ? "none"
                : "transform 450ms cubic-bezier(0.22, 1.2, 0.36, 1)",
            }}
          >
            <Icon name="swap" size={16} />
          </span>
        </span>
      </button>

      {/* Target */}
      <LangButton
        label="Translate to"
        value={getLangName(targetLang)}
        slide={-1}
        reduceMotion={reduceMotion}
        onClick={() => setPickerOpen("target")}
      />

      <LanguagePickerSheet
        open={pickerOpen !== null}
        onOpenChange={(o) => !o && setPickerOpen(null)}
        type={pickerOpen ?? "source"}
        selected={pickerOpen === "source" ? sourceLang : targetLang}
        onSelect={(code) => {
          if (pickerOpen === "source") {
            // If user picks the current target as the new source, swap instead
            if (code === targetLang) {
              onChange({ sourceLang: code, targetLang: sourceLang });
            } else {
              onChange({ sourceLang: code, targetLang });
            }
          } else if (pickerOpen === "target") {
            if (code === sourceLang) {
              onChange({ sourceLang: targetLang, targetLang: code });
            } else {
              onChange({ sourceLang, targetLang: code });
            }
          }
        }}
      />
    </div>
  );
}
