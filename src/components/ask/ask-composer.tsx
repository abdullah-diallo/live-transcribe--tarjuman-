"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS } from "@/lib/constants";
import { Icon } from "@/components/shared/icon";
import { useNavVisibility } from "@/components/layout/nav-visibility";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { haptics } from "@/lib/haptics";
import { useLocale } from "@/lib/i18n/locale-context";

const MAX_ROWS = 5;

export function AskComposer({
  onSend,
  busy,
  disabled,
}: {
  onSend: (text: string) => void;
  busy: boolean;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { setHidden } = useNavVisibility();
  useKeyboardInset();

  // The floating nav capsule (z-50, bottom: safe-area + 12px) would otherwise
  // sit on top of the composer once the keyboard lifts it. Slide it away while
  // the composer has focus — the same mechanism the record screen uses during
  // an active session.
  useEffect(() => {
    setHidden(focused);
  }, [focused, setHidden]);

  // CRITICAL: nav visibility is a single app-wide global. Navigating away while
  // the composer still has focus would strand `hidden: true` and the nav would
  // vanish across every screen with no recovery short of a reload. RecordPage
  // has the same cleanup for the same reason.
  useEffect(() => () => setHidden(false), [setHidden]);

  // Auto-grow 1 → MAX_ROWS rows.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const line = 22;
    ta.style.height = `${Math.min(ta.scrollHeight, line * MAX_ROWS + 20)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || busy || disabled) return;
    haptics.start();
    setValue("");
    onSend(text);
  };

  const lit = focused || hover;

  return (
    <div
      className="shrink-0 px-4 pt-2"
      style={{
        background: COLORS.bg,
        // Rises with the keyboard on iOS (--kb-inset), and closes the gap the
        // floating nav leaves behind once it slides away. Same easing curve as
        // the nav's own hide transition so they move as one gesture.
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + var(--kb-inset, 0px) + ${
          focused ? 12 : 84
        }px)`,
        transition: "padding-bottom 320ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2"
      >
        <div
          className="flex-1 rounded-2xl px-3 py-2"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            background: COLORS.surface,
            // Inline border, so a Tailwind `hover:` can't win — the app's
            // established "lit" pattern (cf. locale-switcher, account-menu).
            border: `1px solid ${lit ? COLORS.accent : COLORS.borderLight}`,
            boxShadow: lit
              ? `0 0 0 1px ${COLORS.accent}, 0 0 16px rgba(46,204,113,0.35)`
              : "0 0 0 rgba(0,0,0,0)",
            transition:
              "border-color 200ms ease, box-shadow 200ms ease, background 200ms ease",
          }}
        >
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              // Enter sends on a real keyboard; on touch it inserts a newline
              // and the button sends — the messaging convention.
              const hasKeyboard =
                typeof window !== "undefined" &&
                window.matchMedia("(hover: hover)").matches;
              if (e.key === "Enter" && !e.shiftKey && hasKeyboard) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t("ask.placeholder")}
            className="w-full resize-none bg-transparent outline-none text-[14.5px] leading-[22px] placeholder:opacity-60"
            style={{ color: COLORS.w }}
          />
        </div>
        <button
          type="submit"
          aria-label={t("ask.send")}
          disabled={!value.trim() || busy || disabled}
          className="h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-[0.95] hover:brightness-110 disabled:opacity-40"
          style={{
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentDk})`,
            color: "#0A0F1C",
            boxShadow: `0 0 24px ${COLORS.accent}35`,
          }}
        >
          <Icon name="send" size={18} color="#0A0F1C" />
        </button>
      </form>
      <div
        className="text-center text-[10.5px] mt-1.5"
        style={{ color: COLORS.t4 }}
      >
        {t("ask.disclaimerShort")}
      </div>
    </div>
  );
}
