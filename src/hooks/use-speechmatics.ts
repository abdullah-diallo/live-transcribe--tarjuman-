"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import type { ConnectionState, LiveSegment } from "@/types";
import { RECONNECT_BACKOFF, SPEECHMATICS } from "@/lib/constants";
import { isOffLanguageScript } from "@/lib/script";
import { keytermsFor } from "@/lib/stt/keyterms";
import { createSpeakerLock } from "@/lib/stt/speaker-lock";

/**
 * Production realtime STT over Speechmatics (RT v2).
 *
 * Deliberately exposes the SAME shape as use-deepgram.ts so the record page can
 * switch engines by swapping one import — see use-stt.ts. Deepgram remains
 * fully wired as the fallback.
 *
 * WHY SPEECHMATICS IS PRIMARY: in side-by-side field tests on Arabic khutbah
 * audio (/dev/stt-compare) it produced whole coherent sentences at ~1.00
 * confidence where nova-3 fragmented into partial segments and dropped clauses.
 * It costs latency — finals land ~1.3-1.5s behind vs ~0.4-0.8s — which is the
 * trade being made deliberately: accurate transcription is the product.
 *
 * PROTOCOL NOTES that differ from Deepgram and matter here:
 *   - Audio sent before RecognitionStarted is DISCARDED, so frames are gated
 *     on the ack rather than the socket being open.
 *   - Finals arrive ONE WORD AT A TIME. They're accumulated into sentences and
 *     flushed on Speechmatics' own `is_eos` marker, because a word-per-segment
 *     transcript would wreck translation quality (each segment is translated
 *     independently — single words have no context to translate against).
 *   - `transcript` lives inside `metadata`, not at the top level.
 *   - Errors arrive as an in-band { message: "Error" } frame with a real reason
 *     BEFORE the socket closes.
 *
 * LIMITS (docs.speechmatics.com/speech-to-text/realtime/limits):
 *   48h max session · 1h idle tolerance with no audio · 3min with no ping/pong.
 * A 3h dars fits comfortably, and the 1h idle window means a pause needs no
 * keepalive — frames are simply dropped, as with Deepgram.
 */

const DBG = process.env.NODE_ENV !== "production";
const dbg: typeof console.log = DBG ? console.log.bind(console) : () => {};

export interface UseSpeechmaticsOptions {
  pcmNode: AudioWorkletNode | null;
  sourceLanguage: string;
  enabled: boolean;
  paused: boolean;
  mainSpeakerOnly?: boolean;
}

export interface UseSpeechmaticsReturn {
  segments: LiveSegment[];
  interimText: string;
  connectionState: ConnectionState;
  error: string | null;
  reconnectAttempt: number;
  resetTranscript: () => void;
}

interface SmAlternative {
  content?: string;
  confidence?: number;
  speaker?: string;
}

interface SmResult {
  type?: string;
  is_eos?: boolean;
  start_time?: number;
  end_time?: number;
  alternatives?: SmAlternative[];
}

interface SmMessage {
  message: string;
  metadata?: { start_time?: number; end_time?: number; transcript?: string };
  results?: SmResult[];
  reason?: string;
  type?: string;
}

/**
 * Drop a finalized sentence below this mean word confidence.
 *
 * Matches the Deepgram floor's intent but sits lower relative to observed
 * output: Speechmatics reported 0.96-1.00 on genuine far-field khutbah speech
 * in testing, so anything under 0.45 is a strong noise signal rather than
 * merely distant speech.
 */
const FINAL_CONFIDENCE_THRESHOLD = 0.45;

/** Flush a sentence anyway after this many words, if no is_eos has arrived. */
const MAX_WORDS_PER_SEGMENT = 25;

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useSpeechmatics({
  pcmNode,
  sourceLanguage,
  enabled,
  paused,
  mainSpeakerOnly = false,
}: UseSpeechmaticsOptions): UseSpeechmaticsReturn {
  const [segments, setSegments] = useState<LiveSegment[]>([]);
  const [interimText, setInterimText] = useState("");
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const authToken = useAuthToken();
  const authTokenRef = useRef<string | null | undefined>(authToken);
  useEffect(() => {
    authTokenRef.current = authToken;
  }, [authToken]);

  // Stale-closure guard for React StrictMode's dev double-mount: each effect
  // run takes a generation, and handlers from older generations no-op.
  const generationRef = useRef(0);

  // Read by the PCM frame handler so pause/resume doesn't rebuild the socket.
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const mainSpeakerOnlyRef = useRef(mainSpeakerOnly);
  useEffect(() => {
    mainSpeakerOnlyRef.current = mainSpeakerOnly;
  }, [mainSpeakerOnly]);

  const speakerLockRef = useRef(
    createSpeakerLock<string>({
      warmupMs: SPEECHMATICS.speakerLockWarmupMs,
      minDurationS: SPEECHMATICS.speakerLockMinDurationS,
      diarizeWarmupMs: SPEECHMATICS.diarizeWarmupMs,
    }),
  );
  const sessionStartRef = useRef<number | null>(null);

  const resetTranscript = useCallback(() => {
    setSegments([]);
    setInterimText("");
  }, []);

  useEffect(() => {
    if (!enabled || !pcmNode) {
      setConnectionState("idle");
      setReconnectAttempt(0);
      speakerLockRef.current.reset();
      sessionStartRef.current = null;
      return;
    }

    const myGeneration = ++generationRef.current;
    const isLive = () => generationRef.current === myGeneration;
    sessionStartRef.current = Date.now();

    // Connection-scoped state lives in this closure, never in refs, so a
    // StrictMode remount cannot cross wires between attempts.
    let cancelled = false;
    let ws: WebSocket | null = null;
    let ready = false; // RecognitionStarted received — audio may flow
    let reconnectTimer: number | null = null;
    let attempt = 0;
    let hasEverOpened = false;
    let seqNo = 0;
    let openWatchdog: number | null = null;

    // Sentence accumulation across AddTranscript word frames.
    let buffer = "";
    let bufferWords = 0;
    let bufferConfs: number[] = [];
    // Per-speaker speech duration WITHIN the sentence being accumulated. The
    // segment is attributed to whoever spoke most of it, matching Deepgram's
    // duration-weighted choice. Taking the first word's speaker instead
    // misattributes any sentence that opens with a brief interjection — and
    // that attribution feeds the speaker lock, so an error there can drop the
    // main speaker or retain a side conversation.
    let bufferSpeakerDurations = new Map<string, number>();
    let bufferStartSec: number | null = null;
    let bufferEndSec: number | null = null;

    const dominantBufferSpeaker = (): string | undefined => {
      let best: string | undefined;
      let bestDur = -1;
      for (const [speaker, dur] of bufferSpeakerDurations) {
        if (dur > bestDur) {
          bestDur = dur;
          best = speaker;
        }
      }
      return best;
    };

    // Speechmatics restarts its audio clock at 0 on every new socket. Without
    // an accumulated offset, timestamps would rewind after a reconnect and the
    // persisted transcript would interleave out of order.
    let timeOffsetSec = 0;
    let lastSeenEndSec = 0;

    const clearWatchdog = () => {
      if (openWatchdog !== null) {
        window.clearTimeout(openWatchdog);
        openWatchdog = null;
      }
    };

    const resetBuffer = () => {
      buffer = "";
      bufferWords = 0;
      bufferConfs = [];
      bufferSpeakerDurations = new Map();
      bufferStartSec = null;
      bufferEndSec = null;
    };

    const flush = () => {
      const text = buffer.trim();
      const confs = bufferConfs;
      const speaker = dominantBufferSpeaker();
      const startSec = bufferStartSec;
      const endSec = bufferEndSec;
      resetBuffer();
      if (!text) return;

      const confidence = confs.length
        ? confs.reduce((a, b) => a + b, 0) / confs.length
        : 1;

      if (confidence < FINAL_CONFIDENCE_THRESHOLD) {
        dbg(`[sm] dropped low-confidence final (${confidence.toFixed(2)})`);
        setInterimText("");
        return;
      }

      // Off-language gate. Shares src/lib/script.ts with the server-side noise
      // filter so both agree on what counts as the wrong script.
      if (isOffLanguageScript(text, sourceLanguage)) {
        dbg(`[sm] dropped off-language segment: "${text.slice(0, 60)}"`);
        setInterimText("");
        return;
      }

      const sessionAgeMs = sessionStartRef.current
        ? Date.now() - sessionStartRef.current
        : 0;
      const lock = speakerLockRef.current;
      lock.maybeLock(sessionAgeMs);

      if (lock.shouldDrop(speaker, sessionAgeMs, mainSpeakerOnlyRef.current)) {
        dbg(`[sm] dropped side-speaker segment (speaker=${speaker})`);
        setInterimText("");
        return;
      }

      setSegments((prev) => [
        ...prev,
        {
          id: makeId(),
          text,
          isFinal: true,
          timestamp:
            startSec !== null
              ? Math.max(0, startSec + timeOffsetSec)
              : (prev[prev.length - 1]?.timestamp ?? 0),
          durationSec:
            startSec !== null && endSec !== null
              ? Math.max(0, endSec - startSec)
              : undefined,
          speaker: lock.displayIndex(speaker, sessionAgeMs),
          confidence,
        },
      ]);
      setInterimText("");
    };

    const tearDown = () => {
      clearWatchdog();
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      pcmNode.port.onmessage = null;
      ready = false;
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({ message: "EndOfStream", last_seq_no: seqNo }),
            );
          }
        } catch {
          /* ignore */
        }
        try {
          ws.close(1000);
        } catch {
          /* ignore */
        }
      }
      ws = null;
    };

    const scheduleReconnect = () => {
      if (cancelled || !isLive()) return;
      if (reconnectTimer !== null) return;
      if (attempt >= RECONNECT_BACKOFF.length) {
        setConnectionState("error");
        setError(
          (prev) =>
            prev ??
            `Could not reach Speechmatics after ${RECONNECT_BACKOFF.length} attempts. Check your network connection.`,
        );
        return;
      }
      const delay = RECONNECT_BACKOFF[attempt];
      attempt += 1;
      setReconnectAttempt(attempt);
      setConnectionState("reconnecting");
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (!cancelled && isLive()) void connect();
      }, delay);
    };

    const connect = async () => {
      if (cancelled || !isLive()) return;
      setConnectionState(attempt === 0 ? "connecting" : "reconnecting");

      // Emit whatever sentence was mid-accumulation BEFORE the clock advances.
      // Speechmatics finals arrive per-word and only become a segment at
      // `is_eos`, so a socket that drops mid-sentence leaves confirmed vendor
      // output sitting in the buffer. Resetting without flushing threw it away.
      // Order matters: flush against the CURRENT offset, then advance it.
      flush();
      timeOffsetSec += lastSeenEndSec;
      lastSeenEndSec = 0;
      resetBuffer();

      let creds: { jwt: string; url: string };
      try {
        const token = authTokenRef.current;
        const res = await fetch("/api/speechmatics", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          let msg = `Speechmatics credentials failed (${res.status})`;
          try {
            const parsed = JSON.parse(body);
            if (parsed?.error) msg = String(parsed.error);
          } catch {
            /* non-JSON (a thrown route returns HTML) — keep the status form */
          }
          // Only a misconfigured server (500 with no key) or a hard plan/auth
          // refusal is worth giving up on. Everything else — 429, 5xx, a dropped
          // request on masjid wifi — is transient, and retrying is exactly what
          // the backoff exists for. Treating every failure as terminal ended a
          // live recording on a two-second blip. Mirrors use-deepgram.ts:345.
          const unrecoverable =
            (res.status === 500 && /API_KEY.*not configured/i.test(msg)) ||
            res.status === 401 ||
            res.status === 402 ||
            res.status === 502;
          if (unrecoverable) {
            setError(msg);
            setConnectionState("error");
            return;
          }
          throw new Error(msg);
        }
        creds = (await res.json()) as { jwt: string; url: string };
        if (!creds.jwt || !creds.url) {
          throw new Error(
            "Speechmatics credentials missing in server response",
          );
        }
      } catch (e) {
        if (cancelled || !isLive()) return;
        setError(e instanceof Error ? e.message : String(e));
        scheduleReconnect();
        return;
      }
      if (cancelled || !isLive()) return;

      const currentWs = new WebSocket(
        `${creds.url}?jwt=${encodeURIComponent(creds.jwt)}`,
      );
      currentWs.binaryType = "arraybuffer";
      ws = currentWs;

      // Watchdog for a socket that stalls in CONNECTING (captive portal,
      // wifi↔cell handoff). None of onopen/onclose/onerror fire in that case.
      clearWatchdog();
      openWatchdog = window.setTimeout(() => {
        if (cancelled || !isLive() || ws !== currentWs) return;
        if (currentWs.readyState === WebSocket.CONNECTING || !ready) {
          dbg("[sm] open/ack watchdog fired — forcing reconnect");
          try {
            currentWs.close();
          } catch {
            /* ignore */
          }
          scheduleReconnect();
        }
      }, 10_000);

      currentWs.onopen = () => {
        if (cancelled || !isLive() || ws !== currentWs) {
          try {
            currentWs.close(1000);
          } catch {
            /* ignore */
          }
          return;
        }
        hasEverOpened = true;
        seqNo = 0;

        const transcription_config: Record<string, unknown> = {
          language: sourceLanguage,
          enable_partials: true,
          max_delay: SPEECHMATICS.maxDelay,
          max_delay_mode: "flexible",
          operating_point: SPEECHMATICS.operatingPoint,
          diarization: "speaker",
          // Speaker focus — the vendor-native counterpart to the speaker lock.
          speaker_diarization_config: { prefer_current_speaker: true },
          additional_vocab: keytermsFor(sourceLanguage).map((content) => ({
            content,
          })),
        };

        // The AudioContext's REAL rate, not the 16000 we requested. Some
        // browsers (notably iOS Safari) ignore the constructor hint and hand
        // back 44100/48000; declaring the wrong rate makes Speechmatics decode
        // the frames at the wrong speed and return garbled or empty text. This
        // is the same trap documented on the Deepgram path.
        const sampleRate = Math.round(
          pcmNode?.context?.sampleRate ?? SPEECHMATICS.fallbackSampleRate,
        );

        currentWs.send(
          JSON.stringify({
            message: "StartRecognition",
            audio_format: {
              type: "raw",
              encoding: "pcm_s16le",
              sample_rate: sampleRate,
            },
            transcription_config,
          }),
        );
      };

      currentWs.onmessage = (event) => {
        if (cancelled || !isLive() || ws !== currentWs) return;
        if (typeof event.data !== "string") return;
        let msg: SmMessage;
        try {
          msg = JSON.parse(event.data) as SmMessage;
        } catch {
          return;
        }

        switch (msg.message) {
          case "RecognitionStarted": {
            clearWatchdog();
            ready = true;
            attempt = 0;
            setConnectionState("connected");
            setError(null);
            setReconnectAttempt(0);

            // Only now may audio flow — pre-ack frames are discarded.
            pcmNode.port.onmessage = (e) => {
              if (cancelled || !isLive() || ws !== currentWs) return;
              if (!ready || pausedRef.current) return;
              if (currentWs.readyState !== WebSocket.OPEN) return;
              const data = e.data as ArrayBuffer;
              if (!data || data.byteLength === 0) return;
              currentWs.send(data);
              seqNo++;
            };
            return;
          }

          case "AddPartialTranscript": {
            // `||` not `??`: Speechmatics sends metadata.transcript as "" on
            // empty partials, and an empty string must fall through to the
            // results array rather than be treated as a real (blank) answer.
            const tail =
              msg.metadata?.transcript?.trim() || textFromResults(msg.results);
            setInterimText(
              [buffer.trim(), tail].filter(Boolean).join(" ").trim(),
            );
            return;
          }

          case "AddTranscript": {
            for (const r of msg.results ?? []) {
              const alt = r.alternatives?.[0];
              const content = alt?.content;
              if (!content) continue;

              if (r.type === "punctuation") {
                buffer += content;
              } else {
                buffer += (buffer ? " " : "") + content;
                bufferWords++;
                if (typeof alt?.confidence === "number") {
                  bufferConfs.push(alt.confidence);
                }
                if (
                  bufferStartSec === null &&
                  typeof r.start_time === "number"
                ) {
                  bufferStartSec = r.start_time;
                }
                // Feed the lock every word, not just flushed sentences, so a
                // long interloper is measured accurately. The same duration
                // also accumulates per-speaker WITHIN this sentence, so flush()
                // can attribute the segment to whoever actually spoke most of it.
                if (
                  alt?.speaker &&
                  typeof r.start_time === "number" &&
                  typeof r.end_time === "number"
                ) {
                  const dur = Math.max(0, r.end_time - r.start_time);
                  bufferSpeakerDurations.set(
                    alt.speaker,
                    (bufferSpeakerDurations.get(alt.speaker) ?? 0) + dur,
                  );
                  speakerLockRef.current.observe(
                    alt.speaker,
                    dur,
                    sessionStartRef.current
                      ? Date.now() - sessionStartRef.current
                      : 0,
                  );
                }
              }
              if (typeof r.end_time === "number") bufferEndSec = r.end_time;
            }
            if (typeof msg.metadata?.end_time === "number") {
              bufferEndSec = msg.metadata.end_time;
            }
            if (bufferEndSec !== null) lastSeenEndSec = bufferEndSec;

            const sentenceEnded = (msg.results ?? []).some((r) => r.is_eos);
            if (sentenceEnded || bufferWords >= MAX_WORDS_PER_SEGMENT) {
              flush();
            } else {
              // Keep interimText in step with the committed-but-unflushed
              // buffer. The record page captures interimText on Stop to rescue
              // the closing words (page.tsx handleStop); if this only updated on
              // AddPartialTranscript, a Stop landing between a committed word
              // and the next partial would rescue a stale string missing that
              // word. Cheap, and it makes the stop-tail capture deterministic.
              setInterimText(buffer.trim());
            }
            return;
          }

          case "Error": {
            const detail = `${msg.type ?? "error"}: ${msg.reason ?? "unknown"}`;
            dbg("[sm] in-band error", detail);
            // quota_exceeded is the one users will actually hit — the free tier
            // allows only 2 concurrent sessions. Say so plainly.
            setError(
              msg.type === "quota_exceeded"
                ? "Speechmatics is at its concurrent-session limit. Wait a moment and try again."
                : `Speechmatics error — ${detail}`,
            );
            setConnectionState("error");
            return;
          }

          case "Warning":
            dbg("[sm] warning", msg.type, msg.reason);
            return;

          default:
            return;
        }
      };

      currentWs.onerror = () => {
        // Browsers hide the cause; the follow-up onclose carries the code.
        dbg("[sm] ws onerror (details hidden by browser)");
      };

      currentWs.onclose = (event) => {
        clearWatchdog();
        dbg("[sm] ws onclose", { code: event.code, reason: event.reason });

        if (ws === currentWs) ws = null;
        ready = false;
        pcmNode.port.onmessage = null;

        if (cancelled || !isLive()) return;
        if (event.code === 1000) {
          setConnectionState("idle");
          return;
        }

        // 4001 not_authorised / 4005 quota / 4006 timelimit are not fixed by
        // retrying blindly; a handshake rejected before any successful open is
        // usually a config or network block. Everything else gets backoff.
        const authFailure = event.code === 4001 || event.code === 4003;
        const quota = event.code === 4005;
        const handshakeRejectionBeforeFirstOpen =
          event.code === 1006 && !hasEverOpened;

        if (authFailure) {
          setError("Speechmatics rejected the session credentials.");
          setConnectionState("error");
          return;
        }
        if (quota) {
          setError(
            "Speechmatics is at its concurrent-session limit. Wait a moment and try again.",
          );
          setConnectionState("error");
          return;
        }
        if (handshakeRejectionBeforeFirstOpen) {
          setError(
            "Could not open a Speechmatics connection. A firewall or network policy may be blocking it.",
          );
          setConnectionState("error");
          return;
        }
        scheduleReconnect();
      };
    };

    void connect();

    return () => {
      cancelled = true;
      // Emit whatever sentence was mid-accumulation so the last words of a
      // recording are not silently lost on stop.
      flush();
      tearDown();
    };
  }, [enabled, pcmNode, sourceLanguage]);

  return {
    segments,
    interimText,
    // Deliberately NOT remapped to "paused" when paused. use-deepgram never
    // emits that state either — the recording UI derives pause from its own
    // `paused` prop and tests `connectionState === "connected" && !paused`.
    // Emitting "paused" here would silently falsify that check.
    connectionState,
    error,
    reconnectAttempt,
    resetTranscript,
  };
}

/** Rebuilds transcript text from a results array, honoring punctuation. */
function textFromResults(results: SmResult[] | undefined): string {
  if (!results?.length) return "";
  let out = "";
  for (const r of results) {
    const content = r.alternatives?.[0]?.content;
    if (!content) continue;
    if (r.type === "punctuation") out += content;
    else out += (out ? " " : "") + content;
  }
  return out;
}
