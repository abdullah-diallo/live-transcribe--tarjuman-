"use client";

import { COLORS } from "@/lib/constants";
import { useLocale } from "@/lib/i18n/locale-context";

/**
 * Three-dot "typing" bubble shown while the model thinks.
 *
 * Deliberately not SummaryLoading: a shimmer skeleton with rotating captions is
 * right for an 8-second summary of a whole lecture, and oversized for a chat
 * reply. It is also load-bearing rather than decorative — Opus 4.8 runs adaptive
 * thinking before emitting any text, so there are several seconds of complete
 * silence on the wire. /api/summarize's own code comments record that an
 * unfilled pause "read as a dead spinner"; this is what fills it.
 */
export function TypingDots() {
  const { t } = useLocale();
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-3.5"
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderStartStartRadius: 6,
      }}
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{t("ask.thinking")}</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="chat-typing-dot block rounded-full"
          style={{ width: 5, height: 5, background: COLORS.t3 }}
        />
      ))}
    </div>
  );
}
