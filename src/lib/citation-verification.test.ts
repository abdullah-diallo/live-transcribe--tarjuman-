import { describe, it, expect } from "vitest";
import { verifyAndEnrich } from "./sunnah";
import { verifyAndEnrichQuran } from "./quran";

/**
 * End-to-end guard on the citation-verification pipeline — the mechanism the
 * product's religious credibility rests on.
 *
 * Two failure modes, and the second is the dangerous one:
 *
 *  1. A GENUINE citation marked "— unverified". Safe in isolation, corrosive in
 *     aggregate: a user who keeps seeing real hadith flagged unverified stops
 *     reading the flag, and then it can't protect them from a fabricated one.
 *     This regressed once already — the 3s per-lookup timeout couldn't survive
 *     the concurrent fan-out of an answer citing several hadith, so genuine
 *     citations failed roughly half the time. Hence the retry + longer budget.
 *
 *  2. A FABRICATED citation surviving into the text. This is the one that
 *     actually hurts someone. Also regressed once: the Quran regex bounded the
 *     ayah at 3 digits, so "(Quran Al-Baqarah:9999)" never matched, was never
 *     looked up, and rendered as bare authentic-looking text.
 *
 * Hits the live hadith dataset and quran.com. Network-dependent by design — the
 * point is to catch that path breaking.
 */
describe("citation verification", () => {
  it("verifies genuine citations and removes fabricated ones", async () => {
    const text = `Real: (Sahih Muslim 875), (Sahih al-Bukhari 934), (Sunan Abi Dawud 652), (Sahih Muslim 2699).
Verses: (Quran Al-Baqarah:229), (Quran Al-Kahf:10).
FABRICATED: (Sahih al-Bukhari 99999) and (Quran Al-Baqarah:9999).`;

    const h = await verifyAndEnrich(text, 8000);
    const q = await verifyAndEnrichQuran(h.text, "en", 8000);

    // 1. Every genuine hadith resolves.
    const realHadith = h.citations.filter((c) => c.number !== "99999");
    expect(realHadith).toHaveLength(4);
    expect(realHadith.every((c) => c.verified)).toBe(true);

    // 2. Every genuine ayah resolves.
    const realVerses = q.citations.filter((c) => c.ayahNumber < 900);
    expect(realVerses).toHaveLength(2);
    expect(realVerses.every((c) => c.verified)).toBe(true);

    // 3. Fabricated references never reach the reader as authentic — the hadith
    //    is stripped outright, and the out-of-range ayah must not survive as
    //    plain text either.
    expect(h.citations.find((c) => c.number === "99999")?.verified).toBe(false);
    expect(q.text).not.toContain("Al-Baqarah:9999)");
  }, 180_000);
});
