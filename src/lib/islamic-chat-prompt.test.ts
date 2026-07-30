import { describe, it, expect } from "vitest";
import { ISLAMIC_CHAT_SYSTEM } from "./islamic-chat-prompt";

/**
 * Guards the one failure mode of this prompt that produces NO error signal.
 *
 * Claude Opus 4.8's prompt-cache minimum is 4096 tokens (it is 2048 on Haiku
 * and Sonnet 4.6). Below that floor, the `cache_control: ephemeral` block we
 * send on every chat turn is silently ignored: `cache_creation_input_tokens`
 * comes back 0, nothing throws, and every single message re-pays full input
 * price for the entire system prompt — roughly a 2x bill, discoverable only by
 * reading the usage logs.
 *
 * A routine "tighten up the prompt" edit is all it takes to fall under. This
 * test is the tripwire.
 *
 * Skipped without an API key so CI stays green; run locally before shipping a
 * prompt change.
 */
const KEY = process.env.ANTHROPIC_API_KEY;

const OPUS_CACHE_MIN = 4096;
// 10% headroom, so a later 200-token trim can't silently cross the line.
const REQUIRED = Math.ceil(OPUS_CACHE_MIN * 1.1);

describe.skipIf(!KEY)("Islamic chat system prompt", () => {
  it("clears the Opus 4.8 prompt-cache minimum with headroom", async () => {
    const res = await fetch(
      "https://api.anthropic.com/v1/messages/count_tokens",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          // MUST be the Opus model — it uses the 4.7-family tokenizer, so a
          // count taken against Sonnet or Haiku is simply the wrong number.
          model: "claude-opus-4-8",
          system: [{ type: "text", text: ISLAMIC_CHAT_SYSTEM }],
          messages: [{ role: "user", content: "x" }],
        }),
      }
    );
    expect(res.ok).toBe(true);
    const { input_tokens } = (await res.json()) as { input_tokens: number };
    console.log(
      `[chat-prompt] ${input_tokens} tokens (Opus 4.8 cache floor ${OPUS_CACHE_MIN}, required ${REQUIRED})`
    );
    expect(input_tokens).toBeGreaterThanOrEqual(REQUIRED);
  }, 30_000);
});
