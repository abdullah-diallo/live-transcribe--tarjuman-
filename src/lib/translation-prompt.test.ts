import { describe, it, expect } from "vitest";
import {
  OFFLANG_MARKER,
  TRANSLATION_CORE_PROMPT,
  buildTranslationUserMessage,
} from "./translation-prompt";
import { looksLikeMetaCommentary } from "./translation-guard";

// Regression guard for the landing-trial "it chats back at me" bug.
//
// The trial (/api/trial/translate) used to send the raw spoken text as a BARE
// user message. With no task framing, the model read it as a conversational
// turn and REPLIED to the visitor — "I'm here to help with translations. Please
// provide a text segment…" / "I don't have a name. I'm an AI assistant…" —
// instead of translating. The framing below is what makes the segment a
// translation TASK, and both the trial and the authenticated app now build
// their prompt from this module so they cannot drift apart again.

describe("buildTranslationUserMessage — frames the segment as a task", () => {
  it("states the translation direction before the text", () => {
    const msg = buildTranslationUserMessage({
      text: "Hello, how are you doing today?",
      sourceName: "English",
      targetName: "Arabic",
    });
    expect(msg).toBe(
      "Translate from English to Arabic:\n\nHello, how are you doing today?"
    );
  });

  it("is NEVER the bare text (the exact shape that caused the chat bug)", () => {
    const text = "What is your name?";
    const msg = buildTranslationUserMessage({
      text,
      sourceName: "English",
      targetName: "Arabic",
    });
    expect(msg).not.toBe(text);
    expect(msg.startsWith("Translate from ")).toBe(true);
    // The segment itself must still be present, unmodified.
    expect(msg.endsWith(text)).toBe(true);
  });

  it("carries the caller's language names through verbatim", () => {
    const msg = buildTranslationUserMessage({
      text: "الحمد لله",
      sourceName: "Arabic",
      targetName: "Urdu",
    });
    expect(msg).toBe("Translate from Arabic to Urdu:\n\nالحمد لله");
  });
});

describe("TRANSLATION_CORE_PROMPT — invariants both callers depend on", () => {
  it("forbids addressing the user and any non-translation output", () => {
    expect(TRANSLATION_CORE_PROMPT).toContain("Output ONLY the translation");
    expect(TRANSLATION_CORE_PROMPT).toContain("Never address the user");
  });

  it("keeps the fragment + already-in-target handling a live transcript needs", () => {
    expect(TRANSLATION_CORE_PROMPT).toContain("Translate fragments as fragments");
    expect(TRANSLATION_CORE_PROMPT).toContain(
      "If the input is already in the target language, output it unchanged"
    );
  });

  it("declares the off-language marker it tells the model to emit", () => {
    expect(OFFLANG_MARKER).toBe("<<<OFFLANG>>>");
    // The rules must reference the exact token both routes strip, or a control
    // token could reach a user's screen.
    expect(TRANSLATION_CORE_PROMPT).toContain(OFFLANG_MARKER);
  });

  it("applies the Islamic-terminology rules regardless of source language", () => {
    expect(TRANSLATION_CORE_PROMPT).toContain(
      "The Islamic-terminology rules below apply REGARDLESS of source language"
    );
  });
});

// The two chat-persona replies the user actually reproduced on the landing
// trial. They are the regression corpus for the guard: before the fix the
// markers did not match either one, so both rendered verbatim as the
// "translation". Task framing now prevents them upstream; the guard is the
// backstop, and it must keep catching exactly these.
describe("looksLikeMetaCommentary — reproduced chat-persona leaks", () => {
  it("catches the reproduced landing-trial replies", () => {
    expect(
      looksLikeMetaCommentary(
        "I'm here to help with translations. Please provide a text segment in English that you'd like me to translate to Arabic."
      )
    ).toBe(true);
    expect(
      looksLikeMetaCommentary(
        "I don't have a name. I'm an AI assistant designed to translate short spoken-transcript segments from English into Arabic."
      )
    ).toBe(true);
  });

  it("does not blank legitimate translated speech", () => {
    for (const ok of [
      "All praise is due to Allah, Lord of the worlds.",
      "The Prophet, peace be upon him, said: actions are but by intentions.",
      "I am here to help you, my brother, in any way I can.",
      "Please provide for the poor and the orphan.",
      "He asked me my name and I told him.",
    ]) {
      expect(looksLikeMetaCommentary(ok)).toBe(false);
    }
  });
});
