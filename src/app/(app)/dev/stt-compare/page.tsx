"use client";

import { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { COLORS, LANGUAGES, STT_COMPARE_ENABLED } from "@/lib/constants";
import { isRtl } from "@/lib/utils";
import { Icon } from "@/components/shared/icon";
import { AudioVisualizer } from "@/components/recording/audio-visualizer";
import { useSttCompare, type EngineState } from "@/hooks/use-stt-compare";
import { lagMsOf, type SttFinal } from "@/lib/stt/types";

/**
 * Side-by-side STT bake-off: one microphone, two engines, same bytes.
 *
 * Read the transcripts, not the summary stats — the stats can only measure what
 * the engines *report* (lag, self-assessed confidence), never whether the Arabic
 * is right. Only you can judge that. The numbers exist to catch the cases where
 * one engine is quietly slower or dropping segments while looking fine.
 *
 * Dev tool, not a product surface: it is unlinked from the nav and lives under
 * /dev on purpose.
 */

const STAT_LABEL: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: COLORS.t3,
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function wordCount(finals: SttFinal[]): number {
  return finals.reduce(
    (n, f) => n + f.text.split(/\s+/).filter(Boolean).length,
    0,
  );
}

function statusColor(status: EngineState["status"]): string {
  if (status === "listening") return COLORS.accent;
  if (status === "connecting") return COLORS.amber;
  if (status === "error") return COLORS.red;
  return COLORS.t3;
}

function EngineColumn({
  name,
  subtitle,
  accent,
  state,
  lang,
}: {
  name: string;
  subtitle: string;
  accent: string;
  state: EngineState;
  lang: string;
}) {
  const rtl = isRtl(lang);
  const lags = state.finals
    .map(lagMsOf)
    .filter((l): l is number => l !== null && l >= 0);
  const confs = state.finals
    .map((f) => f.confidence)
    .filter((c): c is number => c !== null);
  const medLag = median(lags);
  const meanConf = confs.length
    ? confs.reduce((a, b) => a + b, 0) / confs.length
    : null;

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: `1px solid ${COLORS.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: statusColor(state.status),
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 650, color: accent }}>
            {name}
          </div>
          <div style={{ fontSize: 11, color: COLORS.t3 }}>{subtitle}</div>
        </div>
        <div style={{ fontSize: 11, color: COLORS.t3, textAlign: "right" }}>
          {state.status}
        </div>
      </div>

      {/* Per-engine stats. Lag = arrival time minus the engine's own reported
          end-of-audio, so it is comparable across vendors. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 4,
          padding: "10px 14px",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        {[
          ["segments", String(state.finals.length)],
          ["words", String(wordCount(state.finals))],
          ["med lag", medLag === null ? "—" : `${medLag}ms`],
          ["conf", meanConf === null ? "—" : meanConf.toFixed(2)],
        ].map(([label, value]) => (
          <div key={label}>
            <div style={STAT_LABEL}>{label}</div>
            <div style={{ fontSize: 14, color: COLORS.w, fontWeight: 600 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {state.error && (
        <div
          style={{
            padding: "10px 14px",
            background: COLORS.redSoft,
            color: COLORS.red,
            fontSize: 12,
            borderBottom: `1px solid ${COLORS.border}`,
            wordBreak: "break-word",
          }}
        >
          {state.error}
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: 320,
        }}
      >
        {state.finals.length === 0 && !state.partial && (
          <div style={{ color: COLORS.t4, fontSize: 13 }}>
            Nothing yet — start speaking.
          </div>
        )}

        {state.finals.map((f) => {
          const lag = lagMsOf(f);
          return (
            <div key={f.id}>
              <div
                dir={rtl ? "rtl" : "ltr"}
                style={{
                  direction: rtl ? "rtl" : "ltr",
                  textAlign: rtl ? "right" : "left",
                  fontSize: rtl ? 20 : 16,
                  lineHeight: 1.65,
                  color: COLORS.w,
                }}
              >
                {f.text}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: COLORS.t4,
                  marginTop: 3,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span>{(f.arrivedAtMs / 1000).toFixed(1)}s</span>
                {lag !== null && <span>lag {lag}ms</span>}
                {f.confidence !== null && (
                  <span>conf {f.confidence.toFixed(2)}</span>
                )}
                {f.speaker && <span>{f.speaker}</span>}
              </div>
            </div>
          );
        })}

        {state.partial && (
          <div
            dir={rtl ? "rtl" : "ltr"}
            style={{
              direction: rtl ? "rtl" : "ltr",
              textAlign: rtl ? "right" : "left",
              fontSize: rtl ? 20 : 16,
              lineHeight: 1.65,
              color: COLORS.t3,
              opacity: 0.65,
            }}
          >
            {state.partial}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Gate wrapper. Kept as a separate component so the hook-bearing body is never
 * conditionally mounted — an early return inside SttCompare itself would change
 * hook order between builds. `notFound()` 404s rather than showing a "not
 * allowed" page, so the route doesn't advertise that it exists.
 */
export default function SttComparePage() {
  if (!STT_COMPARE_ENABLED) notFound();
  return <SttCompare />;
}

function SttCompare() {
  const [sourceLanguage, setSourceLanguage] = useState("ar");
  const [useKeyterms, setUseKeyterms] = useState(true);
  const [speechmaticsModel, setSpeechmaticsModel] = useState("enhanced");
  const [speechmaticsMaxDelay, setSpeechmaticsMaxDelay] = useState(1.5);
  const [speechmaticsDiarize, setSpeechmaticsDiarize] = useState(true);

  const {
    running,
    starting,
    micError,
    deepgram,
    speechmatics,
    analyser,
    elapsedMs,
    start,
    stop,
  } = useSttCompare({
    sourceLanguage,
    useKeyterms,
    speechmaticsModel,
    speechmaticsMaxDelay,
    speechmaticsDiarize,
  });

  const transcriptDump = useMemo(() => {
    const render = (label: string, s: EngineState) =>
      `### ${label}\n${s.finals.map((f) => f.text).join("\n")}\n`;
    return `${render("Deepgram nova-3", deepgram)}\n${render(
      "Speechmatics",
      speechmatics,
    )}`;
  }, [deepgram, speechmatics]);

  const mm = String(Math.floor(elapsedMs / 60000)).padStart(2, "0");
  const ss = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, "0");

  const controlStyle: React.CSSProperties = {
    background: COLORS.surfaceLight,
    border: `1px solid ${COLORS.borderLight}`,
    borderRadius: 8,
    color: COLORS.w,
    padding: "7px 10px",
    fontSize: 13,
  };

  return (
    <div style={{ padding: "20px 16px 60px", color: COLORS.w }}>
      <div
        style={{
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          STT bake-off
        </h1>
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: COLORS.amber,
            background: COLORS.amberSoft,
            padding: "3px 8px",
            borderRadius: 20,
            fontWeight: 700,
          }}
        >
          dev
        </span>
      </div>
      <p style={{ fontSize: 13, color: COLORS.t3, margin: "0 0 18px" }}>
        One mic, identical PCM frames to both engines. Judge the Arabic yourself
        — the stats only measure speed and self-reported confidence.
      </p>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          marginBottom: 16,
          padding: 12,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12,
        }}
      >
        <select
          value={sourceLanguage}
          onChange={(e) => setSourceLanguage(e.target.value)}
          disabled={running}
          style={controlStyle}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: COLORS.t2,
          }}
        >
          <input
            type="checkbox"
            checked={useKeyterms}
            onChange={(e) => setUseKeyterms(e.target.checked)}
            disabled={running}
          />
          Islamic keyterms
        </label>

        <span style={{ width: 1, height: 22, background: COLORS.border }} />

        <select
          value={speechmaticsModel}
          onChange={(e) => setSpeechmaticsModel(e.target.value)}
          disabled={running}
          style={controlStyle}
          title="Speechmatics accuracy tier"
        >
          <option value="enhanced">SM: enhanced</option>
          <option value="standard">SM: standard</option>
        </select>

        <select
          value={speechmaticsMaxDelay}
          onChange={(e) => setSpeechmaticsMaxDelay(Number(e.target.value))}
          disabled={running}
          style={controlStyle}
          title="Speechmatics max_delay — final transcript latency budget"
        >
          {[0.7, 1, 1.5, 2, 3, 4].map((d) => (
            <option key={d} value={d}>
              SM delay: {d}s
            </option>
          ))}
        </select>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: COLORS.t2,
          }}
        >
          <input
            type="checkbox"
            checked={speechmaticsDiarize}
            onChange={(e) => setSpeechmaticsDiarize(e.target.checked)}
            disabled={running}
          />
          SM speaker focus
        </label>

        <div style={{ flex: 1 }} />

        {running && (
          <>
            <div style={{ width: 90 }}>
              <AudioVisualizer analyser={analyser} active compact />
            </div>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontSize: 15,
                color: COLORS.t2,
              }}
            >
              {mm}:{ss}
            </span>
          </>
        )}

        <button
          onClick={() => (running ? stop() : void start())}
          disabled={starting}
          style={{
            background: running ? COLORS.redSoft : COLORS.accent,
            color: running ? COLORS.red : "#04140A",
            border: running ? `1px solid ${COLORS.red}` : "none",
            borderRadius: 10,
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 650,
            cursor: starting ? "wait" : "pointer",
            minHeight: 40,
          }}
        >
          {starting ? "Starting…" : running ? "Stop" : "Start"}
        </button>
      </div>

      {micError && (
        <div
          style={{
            padding: "10px 14px",
            background: COLORS.redSoft,
            color: COLORS.red,
            borderRadius: 10,
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {micError}
        </div>
      )}

      {/* Side-by-side. Stacks on narrow screens. */}
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "stretch",
          flexWrap: "wrap",
        }}
      >
        <EngineColumn
          name="Deepgram"
          subtitle={`nova-3 · language=${sourceLanguage}${
            useKeyterms ? " · keyterms" : ""
          }`}
          accent={COLORS.blue}
          state={deepgram}
          lang={sourceLanguage}
        />
        <EngineColumn
          name="Speechmatics"
          subtitle={`${speechmaticsModel} · max_delay=${speechmaticsMaxDelay}s${
            speechmaticsDiarize ? " · speaker focus" : ""
          }${useKeyterms ? " · vocab" : ""}`}
          accent={COLORS.accent}
          state={speechmatics}
          lang={sourceLanguage}
        />
      </div>

      <button
        onClick={() => void navigator.clipboard.writeText(transcriptDump)}
        disabled={!deepgram.finals.length && !speechmatics.finals.length}
        style={{
          marginTop: 14,
          background: COLORS.surfaceLight,
          border: `1px solid ${COLORS.borderLight}`,
          borderRadius: 10,
          color: COLORS.t2,
          padding: "9px 14px",
          fontSize: 13,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <Icon name="copy" size={15} />
        Copy both transcripts
      </button>
    </div>
  );
}
