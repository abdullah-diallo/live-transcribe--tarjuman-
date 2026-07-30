"use client";

import { COLORS } from "@/lib/constants";
import { Icon } from "@/components/shared/icon";
import { AnimateIn } from "@/components/recording/animate-in";
import { STARTER_PROMPTS } from "@/components/ask/starter-prompts";
import { useLocale } from "@/lib/i18n/locale-context";

export function AskEmpty({ onPick }: { onPick: (q: string) => void }) {
  const { t } = useLocale();
  return (
    <div className="px-1 pb-2">
      <div className="mb-5">
        <div
          className="text-[20px] font-bold mb-1.5"
          style={{ color: COLORS.w }}
        >
          {t("ask.emptyTitle")}
        </div>
        <div
          className="text-[13.5px] leading-relaxed"
          style={{ color: COLORS.t2 }}
        >
          {t("ask.emptyBody")}
        </div>
      </div>

      <div className="section-label mb-2">{t("ask.starters")}</div>
      <div className="flex flex-col gap-2">
        {/* Full-width rows rather than a wrapping chip cloud — at 420px the
            cloud wraps ragged and reads as clutter. */}
        {STARTER_PROMPTS.map((q, i) => (
          <AnimateIn key={q} variant={i % 2 === 0 ? "source" : "translation"}>
            <button
              onClick={() => onPick(q)}
              className="w-full text-start flex items-center gap-3 rounded-2xl px-4 py-3 text-[13.5px] border border-transparent transition-all duration-200 hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] hover:shadow-[0_0_16px_rgba(46,204,113,0.35)] active:scale-[0.99]"
              style={{ background: COLORS.surface, color: COLORS.w }}
            >
              <span className="flex-1">{q}</span>
              <Icon name="chevron" size={14} color={COLORS.t3} />
            </button>
          </AnimateIn>
        ))}
      </div>
    </div>
  );
}
