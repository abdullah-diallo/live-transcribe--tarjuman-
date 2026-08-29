"use client";

import { memo, type CSSProperties } from "react";
import { COLORS } from "@/lib/constants";
import { isRtl, getLangName } from "@/lib/utils";
import { useStickyBottom } from "@/hooks/use-sticky-bottom";
import { Icon } from "@/components/shared/icon";
import { AnimateIn } from "./animate-in";
import { renderTextWithLinks } from "@/lib/citation-renderer";
import {
  fontSizeForLang,
  speakerColor,
  dominantSpeaker,
  type LiveTranscriptProps,
} from "./live-transcript";
import type { LiveSegment } from "@/types";

/**
 * Per-variant glass tint. `.glass-tile` (globals.css) paints the material —
 * fill, rim, catch-light, underside shade, hover glow; these two custom
 * properties are all a variant needs to change.
 */
function tile(tint: string, rim: string): CSSProperties {
  return { "--tile-tint": tint, "--tile-rim": rim } as CSSProperties;
}

const TILE = "glass-tile rounded-[18px] px-4 py-3";

/**
 * One row in the SOURCE pane, memoized so a parent re-render (interim text /
 * pulse / timer, several times a second) doesn't reconcile every row of a long
 * lecture. Props are primitives + the stable seg object.
 */
const SplitSourceRow = memo(function SplitSourceRow({
  seg,
  text,
  sourceRtl,
  sourceFontSize,
  showSpeakerBadges,
}: {
  seg: LiveSegment;
  text: string;
  sourceRtl: boolean;
  sourceFontSize: number;
  showSpeakerBadges: boolean;
}) {
  const sc = speakerColor(seg.speaker);
  // With one speaker the tile stays neutral smoked glass; once diarization
  // splits the room, each speaker tints their own glass instead of needing a
  // separate accent bar.
  const tinted = showSpeakerBadges && typeof seg.speaker === "number";
  return (
    // The tile is a CHILD of AnimateIn, not AnimateIn itself: anime.js writes
    // an inline transform on its own element, which would override the
    // stylesheet's :hover lift.
    <AnimateIn variant="source" className="mb-[10px]">
      <div
        className={TILE}
        style={{
          ...(tinted
            ? tile(`${sc}14`, `${sc}40`)
            : tile("rgba(255,255,255,0.05)", "rgba(255,255,255,0.09)")),
          textAlign: sourceRtl ? "right" : "left",
        }}
      >
        {showSpeakerBadges && typeof seg.speaker === "number" && (
          <div
            className="text-[10px] font-bold uppercase tracking-wider mb-[2px]"
            style={{ color: sc }}
          >
            Speaker {seg.speaker + 1}
          </div>
        )}
        <div
          style={{
            color: COLORS.t2,
            fontSize: sourceFontSize,
            lineHeight: 1.7,
            fontWeight: sourceRtl ? 500 : 400,
          }}
        >
          {text}
        </div>
      </div>
    </AnimateIn>
  );
});

/** One row in the TARGET pane, memoized (see SplitSourceRow). */
const SplitTargetRow = memo(function SplitTargetRow({
  seg,
  translated,
  pending,
  error,
  targetRtl,
  targetFontSize,
  onRetry,
}: {
  seg: LiveSegment;
  translated: string | undefined;
  pending: boolean;
  error: string | undefined;
  targetRtl: boolean;
  targetFontSize: number;
  onRetry?: (id: string) => void;
}) {
  const align: CSSProperties = { textAlign: targetRtl ? "right" : "left" };

  if (translated && translated.length > 0) {
    return (
      <AnimateIn variant="translation" className="mb-[10px]">
        <div
          className={TILE}
          style={{
            ...tile("rgba(46,204,113,0.07)", "rgba(46,204,113,0.20)"),
            ...align,
          }}
        >
          <div
            style={{
              color: COLORS.w,
              fontSize: targetFontSize,
              lineHeight: 1.7,
              fontWeight: targetRtl ? 600 : 500,
            }}
          >
            {renderTextWithLinks(translated)}
          </div>
        </div>
      </AnimateIn>
    );
  }

  if (pending) {
    return (
      <div
        className={`${TILE} mb-[10px]`}
        style={{
          ...tile("rgba(46,204,113,0.04)", "rgba(46,204,113,0.12)"),
          ...align,
        }}
      >
        <div className="text-[14px]" style={{ color: COLORS.t3 }}>
          …translating
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <button
        type="button"
        onClick={() => onRetry?.(seg.id)}
        className={`${TILE} mb-[10px] w-full text-left cursor-pointer active:scale-[0.99]`}
        style={{
          ...tile("rgba(245,158,11,0.09)", "rgba(245,158,11,0.28)"),
          ...align,
        }}
      >
        <div className="text-[13px] font-semibold" style={{ color: COLORS.amber }}>
          Translation failed — tap to retry
        </div>
      </button>
    );
  }

  // Fail-open: source-only, no translation for this segment. Render nothing
  // rather than an empty tile.
  return null;
});

/**
 * Split ("half and half") transcript view — the same live data as
 * {@link LiveTranscript}, but with each language in its own independently
 * scrolling pane instead of paired cards.
 *
 * Liquid glass: each half is a floating frosted panel (the app's canonical
 * glass material, `.glass-panel`) over a faint ambient wash, and every
 * transcript line is a glass tile inside it. The language label is a small
 * glass chip that the tiles slide under and refract through.
 *
 * Responsive: stacks top (source) / bottom (target) on a phone, becomes
 * left / right panels on a tablet or wider screen (`md:`). Both panes pin to
 * the newest line (sticky-bottom); a "↓ latest" pill appears if the user
 * scrolls up. Drop-in: identical props to LiveTranscript, so the shell can
 * swap between the two with no other change.
 */
export function SplitTranscript({
  segments,
  interimText,
  sourceLang,
  translations,
  targetLang,
  mainSpeakerOnly = false,
  merges,
  suppressedIds,
  filteredIds,
  errors,
  pending,
  onRetry,
}: LiveTranscriptProps) {
  const {
    scrollRef: srcRef,
    onScroll: srcScroll,
    isStuck: srcStuck,
    scrollToBottom: srcToBottom,
  } = useStickyBottom<HTMLDivElement>(200);
  const {
    scrollRef: tgtRef,
    onScroll: tgtScroll,
    isStuck: tgtStuck,
    scrollToBottom: tgtToBottom,
  } = useStickyBottom<HTMLDivElement>(200);

  const sourceRtl = isRtl(sourceLang);
  const targetRtl = targetLang ? isRtl(targetLang) : false;
  const sourceFontSize = fontSizeForLang(sourceLang);
  const targetFontSize = fontSizeForLang(targetLang ?? "en");

  // Same visibility rules as the paired view: optional main-speaker filter,
  // then drop merge-children and server-filtered noise.
  const dominant = dominantSpeaker(segments);
  const speakerFiltered = mainSpeakerOnly
    ? segments.filter((s) => s.speaker === undefined || s.speaker === dominant)
    : segments;
  const visibleSegments = speakerFiltered.filter(
    (s) => !suppressedIds?.has(s.id) && !filteredIds?.has(s.id)
  );

  const speakerSet = new Set<number>();
  for (const s of segments) {
    if (typeof s.speaker === "number") speakerSet.add(s.speaker);
  }
  const showSpeakerBadges = speakerSet.size > 1;

  const showEmpty = visibleSegments.length === 0 && !interimText;

  return (
    <div className="flex-1 min-h-0 relative flex flex-col md:flex-row gap-3 p-3 overflow-hidden">
      {/* Ambient wash. Glass only reads as glass when there is something
          behind it to refract — the same reason the sheets keep their scrim
          light instead of pre-blurring the page. Static and very faint:
          depth, not a light show. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(45% 55% at 22% 18%, rgba(59,130,246,0.10), transparent 70%)," +
            "radial-gradient(45% 55% at 78% 82%, rgba(46,204,113,0.10), transparent 70%)",
        }}
      />

      {/* ── SOURCE half ── */}
      <section className="glass-panel relative flex-1 min-h-0 flex flex-col overflow-hidden rounded-[24px]">
        <PaneLabel name={getLangName(sourceLang)} color={COLORS.t3} />
        <div
          ref={srcRef}
          onScroll={srcScroll}
          dir={sourceRtl ? "rtl" : "ltr"}
          className="flex-1 overflow-auto px-3 pt-[46px] pb-4 transcript-scroll"
          style={{ direction: sourceRtl ? "rtl" : "ltr" }}
        >
          {showEmpty && (
            <EmptyTile>
              <div className="text-sm">Listening…</div>
              <div className="text-xs mt-1">Speak or play audio nearby.</div>
            </EmptyTile>
          )}
          {visibleSegments.map((seg) => {
            const merge = merges?.[seg.id];
            return (
              <SplitSourceRow
                key={seg.id}
                seg={seg}
                text={merge?.combinedSourceText ?? seg.text}
                sourceRtl={sourceRtl}
                sourceFontSize={sourceFontSize}
                showSpeakerBadges={showSpeakerBadges}
              />
            );
          })}
          {interimText && (
            <div
              className={`${TILE} opacity-60`}
              style={{
                ...tile("rgba(59,130,246,0.06)", "rgba(59,130,246,0.16)"),
                textAlign: sourceRtl ? "right" : "left",
              }}
            >
              <div
                style={{
                  color: COLORS.t3,
                  fontSize: sourceFontSize,
                  lineHeight: 1.7,
                  fontWeight: sourceRtl ? 500 : 400,
                }}
              >
                {interimText}
              </div>
            </div>
          )}
        </div>
        {!srcStuck && <LatestPill onClick={() => srcToBottom(true)} />}
      </section>

      {/* ── TARGET half ── */}
      <section className="glass-panel relative flex-1 min-h-0 flex flex-col overflow-hidden rounded-[24px]">
        <PaneLabel name={getLangName(targetLang ?? "en")} color={COLORS.accent} />
        <div
          ref={tgtRef}
          onScroll={tgtScroll}
          dir={targetRtl ? "rtl" : "ltr"}
          className="flex-1 overflow-auto px-3 pt-[46px] pb-4 transcript-scroll"
          style={{ direction: targetRtl ? "rtl" : "ltr" }}
        >
          {showEmpty && (
            <EmptyTile>
              <div className="text-xs">Translation appears here.</div>
            </EmptyTile>
          )}
          {visibleSegments.map((seg) => {
            const merge = merges?.[seg.id];
            return (
              <SplitTargetRow
                key={seg.id}
                seg={seg}
                translated={
                  merge?.combinedTranslatedText ?? translations?.[seg.id]
                }
                pending={pending?.has(seg.id) ?? false}
                error={errors?.[seg.id]}
                targetRtl={targetRtl}
                targetFontSize={targetFontSize}
                onRetry={onRetry}
              />
            );
          })}
        </div>
        {!tgtStuck && <LatestPill onClick={() => tgtToBottom(true)} />}
      </section>
    </div>
  );
}

/**
 * Language label for a pane — a glass chip floating over the scroller
 * (absolute, not a flex sibling) so tiles pass UNDER it and blur through it;
 * see `.glass-chip` in globals.css. The scroller's `pt-[46px]` keeps the first
 * tile clear of it.
 *
 * The wrapper is a transparent, pointer-events-none positioning layer so only
 * the chip itself is visible and the pane below stays fully scrollable —
 * a full-width bar here would re-introduce the divider this replaced.
 */
function PaneLabel({ name, color }: { name: string; color: string }) {
  return (
    <div className="absolute top-0 inset-x-0 z-10 px-3 pt-3 pointer-events-none">
      <span
        className="glass-chip inline-block rounded-[10px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
        style={{ color }}
      >
        {name}
      </span>
    </div>
  );
}

/** Empty-state copy, in the same glass material as the transcript tiles. */
function EmptyTile({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center pt-10">
      <div
        className="glass-tile rounded-[18px] px-5 py-4 text-center"
        style={tile("rgba(255,255,255,0.04)", "rgba(255,255,255,0.07)")}
      >
        <div style={{ color: COLORS.t4 }}>{children}</div>
      </div>
    </div>
  );
}

/** "↓ latest" pill — shown when a pane is scrolled up off the bottom. */
function LatestPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Scroll to latest"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 h-8 rounded-full flex items-center gap-1 text-[11px] font-bold cursor-pointer transition-transform active:scale-95 z-10"
      style={{
        background: COLORS.accent,
        color: "#0A0F1C",
        boxShadow: `0 6px 24px ${COLORS.accent}40, 0 0 0 1px ${COLORS.accent}`,
      }}
    >
      <span>latest</span>
      <Icon name="chevron" size={11} color="#0A0F1C" className="rotate-90" />
    </button>
  );
}
