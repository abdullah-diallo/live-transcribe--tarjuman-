"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { createAudioPipeline, type AudioPipeline } from "@/lib/audio-processor";
import { createDeepgramClient } from "@/lib/stt/deepgram-client";
import { createSpeechmaticsClient } from "@/lib/stt/speechmatics-client";
import type { SttClient, SttFinal, SttStatus } from "@/lib/stt/types";

/**
 * Drives ONE microphone into TWO STT engines simultaneously and exposes both
 * transcripts for side-by-side comparison.
 *
 * THE WHOLE POINT IS THE FAN-OUT. A fair A/B requires both engines to receive
 * the *identical* bytes at the *same* instant — same mic, same Web Audio chain
 * (highpass → lowpass → compressor → gain), same 40ms Int16 frames. Opening two
 * pipelines would give each engine a different capture and the comparison would
 * measure microphone luck rather than model quality.
 *
 * `pcmNode.port.onmessage` is a single-assignment handler, so this hook claims
 * it once and dispatches each frame to every registered engine. Nothing else
 * may touch that port while a comparison is running — which is also why this
 * does NOT reuse use-deepgram.ts (it claims the same port for itself).
 */

export interface EngineState {
  status: SttStatus;
  finals: SttFinal[];
  partial: string;
  error: string | null;
}

const emptyEngine = (): EngineState => ({
  status: "idle",
  finals: [],
  partial: "",
  error: null,
});

export interface CompareOptions {
  sourceLanguage: string;
  useKeyterms: boolean;
  /** Speechmatics accuracy tier. */
  speechmaticsModel: string;
  /** Speechmatics final-transcript delay budget, seconds (0.7–4). */
  speechmaticsMaxDelay: number;
  /** Speaker diarization + speaker focus on Speechmatics. */
  speechmaticsDiarize: boolean;
}

export function useSttCompare(options: CompareOptions) {
  const authToken = useAuthToken();

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [deepgram, setDeepgram] = useState<EngineState>(emptyEngine);
  const [speechmatics, setSpeechmatics] = useState<EngineState>(emptyEngine);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const pipelineRef = useRef<AudioPipeline | null>(null);
  const clientsRef = useRef<SttClient[]>([]);
  // Options are read inside async start(); a ref keeps that read current
  // without making start() a new function on every keystroke. Synced in an
  // effect rather than during render — a render-phase ref write is not safe
  // under concurrent rendering.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const stop = useCallback(() => {
    for (const c of clientsRef.current) {
      try {
        c.stop();
      } catch {
        /* already closed */
      }
    }
    clientsRef.current = [];

    const pipeline = pipelineRef.current;
    pipelineRef.current = null;
    if (pipeline) {
      try {
        pipeline.pcmNode.port.onmessage = null;
      } catch {
        /* already closed */
      }
      void pipeline.teardown();
    }
    setAnalyser(null);
    setRunning(false);
  }, []);

  const start = useCallback(async () => {
    if (pipelineRef.current) return;
    const opts = optionsRef.current;

    setStarting(true);
    setMicError(null);
    setDeepgram(emptyEngine());
    setSpeechmatics(emptyEngine());
    setElapsedMs(0);

    let pipeline: AudioPipeline;
    try {
      pipeline = await createAudioPipeline();
    } catch (e) {
      setMicError(e instanceof Error ? e.message : String(e));
      setStarting(false);
      return;
    }
    pipelineRef.current = pipeline;
    setAnalyser(pipeline.analyser);

    const shared = {
      sourceLanguage: opts.sourceLanguage,
      sampleRate: pipeline.sampleRate,
      useKeyterms: opts.useKeyterms,
      authToken,
    };

    const dg = createDeepgramClient({
      ...shared,
      handlers: {
        onPartial: (partial) => setDeepgram((s) => ({ ...s, partial })),
        onFinal: (final) =>
          setDeepgram((s) => ({ ...s, finals: [...s.finals, final] })),
        onStatus: (status) => setDeepgram((s) => ({ ...s, status })),
        onError: (error) => setDeepgram((s) => ({ ...s, error })),
      },
    });

    const sm = createSpeechmaticsClient({
      ...shared,
      model: opts.speechmaticsModel,
      maxDelay: opts.speechmaticsMaxDelay,
      diarize: opts.speechmaticsDiarize,
      handlers: {
        onPartial: (partial) => setSpeechmatics((s) => ({ ...s, partial })),
        onFinal: (final) =>
          setSpeechmatics((s) => ({ ...s, finals: [...s.finals, final] })),
        onStatus: (status) => setSpeechmatics((s) => ({ ...s, status })),
        onError: (error) => setSpeechmatics((s) => ({ ...s, error })),
      },
    });

    clientsRef.current = [dg, sm];

    // Connect both before streaming. allSettled, not all: one engine failing
    // (missing key, bad config) must not deny the other a run — a half
    // comparison still tells you something, and the failure is on screen.
    const [dgRes, smRes] = await Promise.allSettled([dg.start(), sm.start()]);
    if (dgRes.status === "rejected") {
      setDeepgram((s) => ({
        ...s,
        status: "error",
        error: s.error ?? String(dgRes.reason?.message ?? dgRes.reason),
      }));
    }
    if (smRes.status === "rejected") {
      setSpeechmatics((s) => ({
        ...s,
        status: "error",
        error: s.error ?? String(smRes.reason?.message ?? smRes.reason),
      }));
    }

    // Both engines dead — nothing to compare, so release the mic rather than
    // leaving the OS recording indicator lit over a dead session.
    if (dgRes.status === "rejected" && smRes.status === "rejected") {
      stop();
      setStarting(false);
      return;
    }

    // THE FAN-OUT. One handler, both engines, identical frames.
    pipeline.pcmNode.port.onmessage = (event: MessageEvent) => {
      const frame = event.data as ArrayBuffer;
      for (const c of clientsRef.current) c.send(frame);
    };

    setRunning(true);
    setStarting(false);
  }, [authToken, stop]);

  // Session clock, for the header readout.
  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const id = window.setInterval(
      () => setElapsedMs(Date.now() - startedAt),
      200,
    );
    return () => window.clearInterval(id);
  }, [running]);

  // Release the mic if the page unmounts mid-run.
  useEffect(() => stop, [stop]);

  return {
    running,
    starting,
    micError,
    deepgram,
    speechmatics,
    analyser,
    elapsedMs,
    start,
    stop,
  };
}
