"use client";

import { COLORS } from "@/lib/constants";
import { useLocale } from "@/lib/i18n/locale-context";
import type { ChatCitation } from "@/hooks/use-chat-stream";

/**
 * The "Sources" strip under an answer.
 *
 * Verified chips are accent green; unverified ones are amber and say so. Both
 * link out — the point is that the user can open sunnah.com or quran.com and
 * check, which is the only real defence against a confident wrong answer.
 *
 * When there are no citations we render nothing. Absence is honest: a fabricated
 * "general knowledge" chip would be worse than no chip at all.
 */
export function CitationChips({ citations }: { citations: ChatCitation[] }) {
  const { t } = useLocale();
  if (!citations.length) return null;

  return (
    <div
      className="mt-3 pt-3"
      style={{ borderTop: `1px solid ${COLORS.border}` }}
    >
      <div className="section-label mb-2">{t("ask.sources")}</div>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c, i) => {
          const tone = c.verified
            ? { fg: COLORS.accent, bg: COLORS.accentSoft }
            : { fg: COLORS.amber, bg: COLORS.amberSoft };
          return (
            <a
              key={`${c.url}-${i}`}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 hover:brightness-125"
              style={{
                color: tone.fg,
                background: tone.bg,
                border: `1px solid ${tone.fg}40`,
              }}
            >
              {c.label}
              {!c.verified && ` · ${t("ask.unverified")}`}
            </a>
          );
        })}
      </div>
    </div>
  );
}
