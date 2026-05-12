import { NextRequest, NextResponse } from "next/server";
import {
  ISLAMIC_TERMINOLOGY_RULES,
  ISLAMIC_FEW_SHOT_EXAMPLES,
} from "@/lib/islamic-terminology";
import { requireAuthFromHeader, checkRateLimit } from "@/lib/api-auth";

interface TranslateRequest {
  text: string;
  source?: string;
  target: string;
}

interface AnthropicResponse {
  content?: { type: string; text: string }[];
  error?: { message?: string; type?: string };
  // Surfaced when prompt caching kicks in. Useful for cost telemetry once the
  // system prompt grows past Haiku's 2048-token cache-eligibility threshold.
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

const LANGUAGE_NAMES: Record<string, string> = {
  // Tier 1
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  ru: "Russian",
  hi: "Hindi",
  ja: "Japanese",
  // Tier 2
  ar: "Arabic",
  ko: "Korean",
  zh: "Chinese",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  tr: "Turkish",
  pl: "Polish",
  cs: "Czech",
  hu: "Hungarian",
  no: "Norwegian",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  el: "Greek",
  he: "Hebrew",
  ro: "Romanian",
  ca: "Catalan",
  uk: "Ukrainian",
};

function languageName(code: string | undefined): string {
  if (!code) return "the source language";
  return LANGUAGE_NAMES[code] ?? code;
}

// Translation system prompt. The Islamic-terminology rules are the whole
// reason this app uses an LLM (instead of Google Translate) — Google flattens
// "Allah" → "God" and strips honorifics, which is unacceptable for the
// khutbah audience. The shared rules + few-shot examples are pulled in from
// a module so /api/summarize uses identical guidance.
//
// `cache_control: ephemeral` is set on this block below; the prompt is
// large enough to comfortably exceed Haiku's 2048-token cache threshold,
// so subsequent calls within a 5-minute window pay ~10% of input cost.
const SYSTEM_PROMPT = `You are a translation engine for a live transcription app used primarily for Islamic lectures, khutbahs, classes, and Quranic study. Translate the user's text from the source language to the target language and output ONLY the translation — no preamble, no commentary, no quotation marks, no language labels.

## General rules
- Output ONLY the translation. Never address the user. Never include notes, warnings, parentheticals about input quality, requests for clarification, or any text that is not itself a translation of the input.
- Match the register of the source. Formal Arabic (MSA / classical) → formal English. Conversational → conversational.
- Input may be a fragment or mid-sentence — this is a live transcription app, so the speaker hasn't finished. Translate fragments as fragments. If a word is cut off mid-syllable, translate what's there and end with "..." rather than commenting on the cut.
- If the input is already in the target language, output it unchanged.
- If the input is empty, gibberish, or genuinely untranslatable, output an empty string (do not invent translations of noise, do not explain why).

${ISLAMIC_TERMINOLOGY_RULES}

${ISLAMIC_FEW_SHOT_EXAMPLES}`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  // 1. Authenticate. Without this, anyone who finds the route URL can
  //    drain the Anthropic budget — see /Users/ard/.claude/plans/...
  const auth = await requireAuthFromHeader(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Sign in to use translation." },
      { status: 401 }
    );
  }

  // 2. Per-user rate limit (60/min token bucket).
  const limit = checkRateLimit(auth.userId, "translate");
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Translation rate limit hit. Try again in ${limit.retryAfterSec}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      }
    );
  }

  let body: TranslateRequest;
  try {
    body = (await req.json()) as TranslateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text, source, target } = body;
  if (!text || typeof text !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid `text`" },
      { status: 400 }
    );
  }
  if (!target || typeof target !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid `target` language code" },
      { status: 400 }
    );
  }

  // No-op when source === target. Skipping the upstream call avoids both
  // unnecessary cost and unnecessary latency.
  if (source && source === target) {
    return NextResponse.json({ translatedText: text });
  }

  const sourceName = languageName(source);
  const targetName = languageName(target);

  // 15s timeout. Anthropic Haiku usually responds in 0.3–1.5s for short
  // segments; anything beyond 15s indicates upstream trouble and we'd
  // rather fail fast than hang the user's transcript indefinitely.
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `Translate from ${sourceName} to ${targetName}:\n\n${text}`,
          },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timed out|abort/i.test(msg)) {
      return NextResponse.json(
        { error: "Translation timed out. Try again." },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: `Translation failed: ${msg}` },
      { status: 502 }
    );
  }

  const data = (await response.json().catch(() => ({}))) as AnthropicResponse;

  if (!response.ok || data.error) {
    const detail = data.error?.message ?? `HTTP ${response.status}`;
    return NextResponse.json(
      { error: `Translation failed: ${detail}` },
      { status: 502 }
    );
  }

  const translatedText = data.content?.find((b) => b.type === "text")?.text;
  if (typeof translatedText !== "string") {
    return NextResponse.json(
      { error: "Translator returned no text" },
      { status: 502 }
    );
  }

  // Trim incidental whitespace — model occasionally adds a trailing newline.
  return NextResponse.json({ translatedText: translatedText.trim() });
}
