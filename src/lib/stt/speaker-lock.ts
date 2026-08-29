/**
 * Session-wide speaker lock — "ignore side conversations".
 *
 * Accumulates how much each speaker has actually spoken, then locks onto the
 * dominant one and reports later segments from anyone else as droppable. This
 * is what keeps a neighbour's whisper, a cough, or a side conversation out of a
 * khutbah transcript.
 *
 * Extracted from use-deepgram.ts's inline implementation so it can be unit
 * tested (the inline version never could be) and shared by any provider. It is
 * generic over the speaker key because vendors disagree on the type: Deepgram
 * returns numeric indices, Speechmatics returns labels like "S1".
 *
 * BOTH engines now run this module (2026-08-29). The earlier note here said
 * use-deepgram.ts should keep its inline copy because "the safest thing to do
 * with a fallback is not touch it" — that was reversed deliberately. A fallback
 * whose speaker policy silently diverges from the tested one is worse than no
 * fallback, because the divergence only surfaces during an outage, which is
 * the worst possible moment to discover it. speaker-lock.test.ts covers both
 * engines' parameterizations for exactly this reason: Deepgram is the config
 * nobody exercises by hand.
 */

export interface SpeakerLockOptions {
  /** Don't lock before the session has run this long. */
  warmupMs: number;
  /** A speaker needs at least this much total speech before it can be locked. */
  minDurationS: number;
  /**
   * Ignore diarization entirely before this session age — no lock accounting
   * and no per-segment speaker id.
   *
   * Deepgram needs a long window here (~25s) because its live diarizer parks
   * everything on speaker 0 and then re-clusters, which would split a lone
   * khateeb into two speakers. Speechmatics runs `prefer_current_speaker` and
   * held a single stable label across field tests, so it uses a shorter one.
   */
  diarizeWarmupMs: number;
}

export interface SpeakerLock<K> {
  /** Record speech duration for a speaker. Ignored during diarize warmup. */
  observe(speaker: K, durationSec: number, sessionAgeMs: number): void;
  /** True while diarization output should be ignored entirely. */
  inDiarizeWarmup(sessionAgeMs: number): boolean;
  /**
   * Attempt to lock, if warmed up and some speaker has enough speech.
   * Idempotent — a lock, once taken, is never reassigned within a session.
   */
  maybeLock(sessionAgeMs: number): void;
  /** The locked speaker, or null if not yet locked. */
  locked(): K | null;
  /**
   * Whether this segment should be dropped as a side conversation.
   * Only ever true when `enabled` (the user's main-speaker-only toggle) is on,
   * a lock has been taken, and this segment belongs to someone else.
   */
  shouldDrop(
    speaker: K | undefined,
    sessionAgeMs: number,
    enabled: boolean,
  ): boolean;
  /**
   * Stable display index, re-based to first-seen order, so the main speaker
   * always reads as "Speaker 1" regardless of the vendor's own numbering.
   * Returns undefined during diarize warmup (no reliable identity yet).
   */
  displayIndex(
    speaker: K | undefined,
    sessionAgeMs: number,
  ): number | undefined;
  /** Clear all state. Call between sessions so a stale lock never carries over. */
  reset(): void;
}

export function createSpeakerLock<K>(
  options: SpeakerLockOptions,
): SpeakerLock<K> {
  const { warmupMs, minDurationS, diarizeWarmupMs } = options;

  let lockedSpeaker: K | null = null;
  let durations = new Map<K, number>();
  let remap = new Map<K, number>();
  let nextDisplay = 0;

  const inDiarizeWarmup = (sessionAgeMs: number) =>
    sessionAgeMs < diarizeWarmupMs;

  return {
    inDiarizeWarmup,

    observe(speaker, durationSec, sessionAgeMs) {
      if (inDiarizeWarmup(sessionAgeMs)) return;
      if (!(durationSec > 0)) return;
      durations.set(speaker, (durations.get(speaker) ?? 0) + durationSec);
    },

    maybeLock(sessionAgeMs) {
      if (lockedSpeaker !== null) return;
      if (inDiarizeWarmup(sessionAgeMs)) return;
      if (sessionAgeMs < warmupMs) return;

      let best: K | null = null;
      let bestDur = -1;
      for (const [speaker, dur] of durations) {
        if (dur > bestDur) {
          bestDur = dur;
          best = speaker;
        }
      }
      if (best !== null && bestDur >= minDurationS) lockedSpeaker = best;
    },

    locked: () => lockedSpeaker,

    shouldDrop(speaker, sessionAgeMs, enabled) {
      if (!enabled) return false;
      if (inDiarizeWarmup(sessionAgeMs)) return false;
      if (lockedSpeaker === null) return false;
      if (speaker === undefined) return false;
      return speaker !== lockedSpeaker;
    },

    displayIndex(speaker, sessionAgeMs) {
      if (speaker === undefined) return undefined;
      if (inDiarizeWarmup(sessionAgeMs)) return undefined;
      let display = remap.get(speaker);
      if (display === undefined) {
        display = nextDisplay++;
        remap.set(speaker, display);
      }
      return display;
    },

    reset() {
      lockedSpeaker = null;
      durations = new Map();
      remap = new Map();
      nextDisplay = 0;
    },
  };
}
