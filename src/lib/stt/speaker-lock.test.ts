import { describe, it, expect } from "vitest";
import { createSpeakerLock } from "./speaker-lock";
import { DEEPGRAM, SPEECHMATICS } from "@/lib/constants";

const opts = {
  warmupMs: 15_000,
  minDurationS: 5,
  diarizeWarmupMs: 10_000,
};

const lock = () => createSpeakerLock<string>(opts);

describe("speaker lock", () => {
  it("ignores diarization entirely during the warmup window", () => {
    const l = lock();
    l.observe("S1", 30, 5_000); // inside diarize warmup — must not count
    l.maybeLock(20_000);
    expect(l.locked()).toBeNull();
    expect(l.displayIndex("S1", 5_000)).toBeUndefined();
  });

  it("does not lock before the lock warmup elapses", () => {
    const l = lock();
    l.observe("S1", 30, 12_000);
    l.maybeLock(12_000); // past diarize warmup, before lock warmup
    expect(l.locked()).toBeNull();
  });

  it("does not lock a speaker with too little speech", () => {
    const l = lock();
    l.observe("S1", 2, 20_000); // under minDurationS
    l.maybeLock(20_000);
    expect(l.locked()).toBeNull();
  });

  it("locks onto the dominant speaker once warmed up", () => {
    const l = lock();
    l.observe("S1", 30, 20_000);
    l.observe("S2", 3, 20_000);
    l.maybeLock(20_000);
    expect(l.locked()).toBe("S1");
  });

  it("never reassigns a lock once taken", () => {
    const l = lock();
    l.observe("S1", 30, 20_000);
    l.maybeLock(20_000);
    // A louder interloper shows up later and must not steal the lock.
    l.observe("S2", 500, 60_000);
    l.maybeLock(60_000);
    expect(l.locked()).toBe("S1");
  });

  it("drops side speakers only when the toggle is enabled", () => {
    const l = lock();
    l.observe("S1", 30, 20_000);
    l.maybeLock(20_000);
    expect(l.shouldDrop("S2", 20_000, true)).toBe(true);
    // Toggle off = multi-speaker Q&A captured in full.
    expect(l.shouldDrop("S2", 20_000, false)).toBe(false);
    // The locked speaker is always kept.
    expect(l.shouldDrop("S1", 20_000, true)).toBe(false);
  });

  it("keeps segments with no speaker attribution", () => {
    const l = lock();
    l.observe("S1", 30, 20_000);
    l.maybeLock(20_000);
    // Undefined speaker must never be dropped — a missing label is not
    // evidence of a side conversation.
    expect(l.shouldDrop(undefined, 20_000, true)).toBe(false);
  });

  it("drops nothing before a lock is taken", () => {
    const l = lock();
    expect(l.shouldDrop("S2", 20_000, true)).toBe(false);
  });

  it("re-bases display indices to first-seen order", () => {
    const l = lock();
    // Vendor numbering starts at S7 — the first speaker seen should read as 0.
    expect(l.displayIndex("S7", 20_000)).toBe(0);
    expect(l.displayIndex("S3", 20_000)).toBe(1);
    expect(l.displayIndex("S7", 20_000)).toBe(0); // stable across calls
  });

  it("reset clears lock, durations, and display mapping", () => {
    const l = lock();
    l.observe("S1", 30, 20_000);
    l.maybeLock(20_000);
    l.displayIndex("S1", 20_000);
    l.reset();
    expect(l.locked()).toBeNull();
    l.maybeLock(20_000);
    expect(l.locked()).toBeNull(); // durations cleared, nothing to lock
    expect(l.displayIndex("S9", 20_000)).toBe(0); // remap cleared
  });
});

/**
 * Deepgram parameterization. Both engines run this same module, so the
 * fallback engine's config gets the same coverage as the primary one —
 * otherwise a "safe" edit to the shared lock could silently break the engine
 * we only find out about during an outage.
 *
 * Two things differ from Speechmatics and both are load-bearing:
 *   - speaker keys are NUMBERS, not "S1" labels, and the first one is 0
 *   - the diarize warmup (25s) is LONGER than the lock warmup (15s)
 */
describe("speaker lock — Deepgram parameterization", () => {
  const dgOpts = {
    warmupMs: DEEPGRAM.speakerLockWarmupMs,
    minDurationS: DEEPGRAM.speakerLockMinDurationS,
    diarizeWarmupMs: DEEPGRAM.diarizeWarmupMs,
  };
  const dg = () => createSpeakerLock<number>(dgOpts);

  it("uses a diarize warmup longer than the lock warmup", () => {
    // This ordering is what the next two tests exercise. If it ever inverts,
    // they stop testing what they claim to.
    expect(DEEPGRAM.diarizeWarmupMs).toBeGreaterThan(
      DEEPGRAM.speakerLockWarmupMs,
    );
    expect(SPEECHMATICS.diarizeWarmupMs).toBeLessThan(DEEPGRAM.diarizeWarmupMs);
  });

  it("stays unlocked past the lock warmup while still inside diarize warmup", () => {
    const l = dg();
    // t=20s is past speakerLockWarmupMs (15s) but inside diarizeWarmupMs (25s),
    // a window that does not exist for Speechmatics. Deepgram's live diarizer
    // parks everything on speaker 0 here, so locking now would lock onto an
    // artifact.
    l.observe(0, 30, 20_000);
    l.maybeLock(20_000);
    expect(l.locked()).toBeNull();
    expect(l.displayIndex(0, 20_000)).toBeUndefined();
  });

  it("locks onto speaker 0 — a falsy but valid speaker id", () => {
    const l = dg();
    // The lone-khateeb case: Deepgram numbers the only speaker 0. Any truthiness
    // check (`if (!speaker)`) instead of an `=== undefined` check would treat
    // the main speaker as "no speaker" and break the primary use case outright.
    l.observe(0, 30, 30_000);
    l.maybeLock(30_000);
    expect(l.locked()).toBe(0);
    expect(l.displayIndex(0, 30_000)).toBe(0);
    expect(l.shouldDrop(1, 30_000, true)).toBe(true);
    expect(l.shouldDrop(0, 30_000, true)).toBe(false);
  });

  it("re-bases post-reclustering indices so the khateeb reads as Speaker 1", () => {
    const l = dg();
    // Deepgram re-clusters after warmup and may renumber the same person to a
    // higher index; the first speaker seen after warmup must still display as 0.
    expect(l.displayIndex(3, 30_000)).toBe(0);
    expect(l.displayIndex(0, 30_000)).toBe(1);
    expect(l.displayIndex(3, 30_000)).toBe(0);
  });

  it("accumulates per-word durations across a session, then locks the dominant speaker", () => {
    const l = dg();
    // Mirrors the hook: observe() is called once per word, not once per segment.
    for (let i = 0; i < 20; i++) l.observe(0, 0.4, 30_000); // 8.0s
    for (let i = 0; i < 5; i++) l.observe(1, 0.4, 30_000); // 2.0s
    l.maybeLock(30_000);
    expect(l.locked()).toBe(0);
  });

  it("ignores zero and negative word durations", () => {
    const l = dg();
    // Deepgram emits words whose start === end; they must not count as speech.
    l.observe(1, 0, 30_000);
    l.observe(1, -2, 30_000);
    l.maybeLock(30_000);
    expect(l.locked()).toBeNull();
  });

  it("reset clears state between sessions", () => {
    const l = dg();
    l.observe(0, 30, 30_000);
    l.maybeLock(30_000);
    expect(l.locked()).toBe(0);
    l.reset();
    // A stale lock carried into the next recording would drop the new speaker.
    expect(l.locked()).toBeNull();
    expect(l.shouldDrop(1, 30_000, true)).toBe(false);
  });
});
