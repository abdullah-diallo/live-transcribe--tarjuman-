"use client";

import { memo, useState } from "react";
import { COLORS } from "@/lib/constants";
import { isRtl } from "@/lib/utils";
import { Icon } from "@/components/shared/icon";
import { Markdown } from "@/components/session/markdown";
import { CitationChips } from "@/components/ask/citation-chips";
import { copyToClipboard } from "@/lib/clipboard";
import { useLocale } from "@/lib/i18n/locale-context";
import type { ChatCitation } from "@/hooks/use-chat-stream";

const MemoMarkdown = memo(Markdown);

/**
 * A copied answer travels without the disclaimer that sits above the thread, so
 * it carries its own. The screenshot-captioned-"Tarjuman says X is haram" case
 * is the reputational failure mode for this feature; provenance is the cheapest
 * mitigation available.
 */
const COPY_SUFFIX =
  "\n\n— via Tarjuman AI. Study help, not a fatwa; verify with a scholar.";

export function UserBubble({ text }: { text: string }) {
  const rtl = isRtl(useLocale().locale);
  return (
    <div className="flex justify-end">
      <div
        dir={rtl ? "rtl" : "ltr"}
        className="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[14px] font-semibold whitespace-pre-wrap"
        style={{
          background: COLORS.accentSoft,
          color: COLORS.accent,
          border: `1px solid ${COLORS.accent}30`,
          // The one asymmetric corner that makes it read as a message rather
          // than a card.
          borderEndEndRadius: 6,
        }}
      >
        {text}
      </div>
    </div>
  );
}

export const AssistantMessage = memo(function AssistantMessage({
  text,
  citations,
  streaming = false,
  verifying = false,
  truncated = false,
}: {
  text: string;
  citations?: ChatCitation[];
  streaming?: boolean;
  verifying?: boolean;
  truncated?: boolean;
}) {
  const { t, locale } = useLocale();
  const rtl = isRtl(locale);
  const [copied, setCopied] = useState(false);

  // While streaming, split at the last newline: completed lines go through a
  // memoized <Markdown> (re-parses once or twice a second as lines finish), and
  // only the trailing partial line renders as plain text. Re-parsing a growing
  // 5KB string through react-markdown + remark-gfm at 60fps is the one real
  // perf trap in this screen, and this removes it. Rendering the tail as plain
  // text also avoids the "pops into a bulleted list" jump when a line completes.
  let stable = text;
  let tail = "";
  if (streaming) {
    const cut = text.lastIndexOf("\n");
    stable = cut === -1 ? "" : text.slice(0, cut);
    tail = cut === -1 ? text : text.slice(cut + 1);
  }

  const onCopy = async () => {
    if (await copyToClipboard(text + COPY_SUFFIX)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <div className="flex justify-start">
      <div
        className="w-full max-w-[95%] rounded-2xl px-4 py-3.5"
        style={{
          background: COLORS.surface,
          // Dashed while unsettled: an answer whose citations haven't been
          // checked yet must never LOOK settled. Verification only runs on the
          // final text, so there are a few seconds where an unverified
          // reference is on screen — this is what says so.
          border: `1px ${streaming || verifying ? "dashed" : "solid"} ${
            streaming || verifying ? COLORS.borderLight : `${COLORS.accent}30`
          }`,
          borderStartStartRadius: 6,
          transition: "border-color 200ms ease",
        }}
      >
        {stable && (
          <MemoMarkdown fontSize={rtl ? 17 : 15} rtl={rtl}>
            {stable}
          </MemoMarkdown>
        )}
        {streaming && tail && (
          <p
            dir={rtl ? "rtl" : "ltr"}
            className="whitespace-pre-wrap"
            style={{
              fontSize: rtl ? 17 : 15,
              lineHeight: 1.7,
              color: COLORS.w,
              margin: 0,
            }}
          >
            {tail}
            <span className="chat-caret" aria-hidden />
          </p>
        )}

        {verifying && (
          <div className="mt-2 text-[12px]" style={{ color: COLORS.t3 }}>
            {t("ask.verifying")}
          </div>
        )}

        {truncated && (
          <div className="mt-2 text-[12px]" style={{ color: COLORS.amber }}>
            {t("ask.stopped")}
          </div>
        )}

        {!streaming && !verifying && (
          <>
            {citations && <CitationChips citations={citations} />}
            <div className="mt-2 flex justify-end">
              <button
                onClick={onCopy}
                className="flex items-center gap-1 text-[11px] font-semibold rounded-lg px-2 py-1 border border-transparent transition-all duration-200 hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                style={{ color: copied ? COLORS.accent : COLORS.t3 }}
              >
                <Icon
                  name={copied ? "check" : "copy"}
                  size={12}
                  color={copied ? COLORS.accent : COLORS.t3}
                />
                {copied ? t("ask.copied") : t("ask.copy")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
