/**
 * Haptic feedback helpers. Safely no-op on devices without `navigator.vibrate`
 * (every desktop browser, iOS Safari) so callers don't need to feature-detect.
 *
 * Patterns are intentionally short — long vibrations during a lecture would be
 * disruptive. The "stop" pattern uses a brief double-pulse to feel distinct
 * from start/pause without being attention-grabbing.
 */

function safeVibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore — some browsers throw if a user gesture isn't in flight */
  }
}

export const haptics = {
  start: () => safeVibrate(20),
  pause: () => safeVibrate(15),
  resume: () => safeVibrate(15),
  stop: () => safeVibrate([20, 60, 20]),
};
