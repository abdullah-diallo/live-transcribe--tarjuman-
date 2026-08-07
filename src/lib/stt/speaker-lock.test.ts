import { describe, it, expect } from "vitest";
import { createSpeakerLock } from "./speaker-lock";

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
