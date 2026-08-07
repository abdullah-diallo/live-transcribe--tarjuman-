import { describe, it, expect } from "vitest";
import { checkRateLimit } from "./api-auth";

/**
 * Guards the rate-limit bucket names used by the API routes.
 *
 * LIMITS is typed Record<string, LimitConfig>, so `keyof typeof LIMITS` is just
 * `string` — TypeScript cannot catch a misspelled bucket. A wrong name reads
 * `undefined.capacity` and throws, which Next serves as an opaque HTML 500.
 * That is exactly how /api/speechmatics shipped with "deepgram" instead of
 * "transcribe". These assert every name a route actually passes.
 */
describe("checkRateLimit bucket names", () => {
  const usedByRoutes = [
    "transcribe", // /api/deepgram, /api/speechmatics
    "translate",
    "summarize",
    "studynotes",
    "translatetranscript",
    "ask",
  ] as const;

  for (const kind of usedByRoutes) {
    it(`"${kind}" resolves to a real bucket`, () => {
      expect(() => checkRateLimit(`test-user-${kind}`, kind)).not.toThrow();
      expect(checkRateLimit(`test-user2-${kind}`, kind).allowed).toBe(true);
    });
  }

  it("an unknown bucket name throws rather than silently allowing", () => {
    // Documents the failure mode: this is what a typo does at runtime.
    expect(() =>
      checkRateLimit("test-user", "deepgram" as "transcribe")
    ).toThrow();
  });
});
