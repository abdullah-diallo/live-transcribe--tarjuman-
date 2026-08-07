"use client";

import { STT_PROVIDER } from "@/lib/constants";
import { useDeepgram } from "./use-deepgram";
import { useSpeechmatics } from "./use-speechmatics";
import type { ConnectionState, LiveSegment } from "@/types";

/**
 * Realtime STT for the recording path, dispatched to the configured engine.
 *
 * Both hooks expose an identical surface, so the record page never knows which
 * engine is live. Switch the whole app by editing STT_PROVIDER in lib/constants.
 *
 * WHY A DISPATCHER RATHER THAN JUST SWAPPING THE IMPORT: keeping Deepgram
 * reachable in one edit is the point — it is the fallback if Speechmatics has an
 * outage, hits its concurrent-session cap, or turns out worse on some dialect we
 * haven't tested. A dispatcher also keeps the two hooks honest about sharing a
 * contract; drift shows up as a type error here rather than at runtime.
 *
 * Both hooks are CALLED unconditionally — React requires a stable hook order —
 * but the inactive one is passed `enabled: false`, which is its documented idle
 * path: no credential fetch, no socket, no mic frames consumed.
 */

export interface UseSttOptions {
  pcmNode: AudioWorkletNode | null;
  sourceLanguage: string;
  enabled: boolean;
  paused: boolean;
  /**
   * Session-wide speaker lock: after warmup, keep only the dominant speaker
   * and drop side conversations. Off means every speaker is captured.
   */
  mainSpeakerOnly?: boolean;
}

export interface UseSttReturn {
  segments: LiveSegment[];
  interimText: string;
  connectionState: ConnectionState;
  error: string | null;
  reconnectAttempt: number;
  resetTranscript: () => void;
}

export function useStt(options: UseSttOptions): UseSttReturn {
  const useSpeechmaticsEngine = STT_PROVIDER === "speechmatics";

  const speechmatics = useSpeechmatics({
    ...options,
    enabled: options.enabled && useSpeechmaticsEngine,
  });
  const deepgram = useDeepgram({
    ...options,
    enabled: options.enabled && !useSpeechmaticsEngine,
  });

  return useSpeechmaticsEngine ? speechmatics : deepgram;
}
