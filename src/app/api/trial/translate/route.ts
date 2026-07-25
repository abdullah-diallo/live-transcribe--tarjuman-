import { NextRequest, NextResponse } from "next/server";
import {
  ISLAMIC_TERMINOLOGY_RULES,
  ISLAMIC_FEW_SHOT_EXAMPLES,
} from "@/lib/islamic-terminology";
import { LANGUAGES } from "@/lib/constants";
import { verifyAndEnrich } from "@/lib/sunnah";
import { verifyAndEnrichQuran } from "@/lib/quran";
import { looksLikeMetaCommentary } from "@/lib/translation-guard";
import {
  OFFLANG_MARKER,
  TRANSLATION_CORE_PROMPT,
  buildTranslationUserMessage,
} from "@/lib/translation-prompt";

/**
 * Anonymous translation for the landing-page "Try it live" trial — the only
 * unauthenticated path to Claude in the app. The real /api/translate requires a
 * signed-in user; this exists so a visitor can test the product without an
 * account, and is locked down to keep that safe:
 *
 *   • hard input cap (short spoken segments only),
 *   • small max_tokens (a segment translation is tiny),
 *   • per-IP token-bucket rate limit + a per-instance global circuit breaker.
 *
 * The limiter is best-effort: serverless instances are ephemeral, so the bucket
 * resets on cold start and isn't shared across instances. It's a cost fuse for
 * the trial, not a security boundary — the tight input/output caps are what
 * actually bound per-call cost. (A durable shared limiter is the same deferred
 * item the billing path needs.)
 */

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TEXT = 280;

const LANG_NAME = new Map<string, string>(
  LANGUAGES.map((l) => [l.code, l.name])
);

// ── Per-IP token bucket ──────────────────────────────────────────────────
interface Bucket {
  tokens: number;
  last: number;
}
const buckets = new Map<string, Bucket>();
const BURST = 40; // allow a quick burst (a trial produces several segments fast)
const REFILL_PER_SEC = 40 / 600; // ≈ 40 translations per 10 minutes, sustained

function allowIp(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: BURST, last: now };
  b.tokens = Math.min(BURST, b.tokens + ((now - b.last) / 1000) * REFILL_PER_SEC);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  // Opportunistic cleanup so the map can't grow unbounded across many IPs.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now - v.last > 3600_000) buckets.delete(k);
    }
  }
  return true;
}

// ── Per-instance global circuit breaker ──────────────────────────────────
let windowStart = Date.now();
let windowCount = 0;
const GLOBAL_MAX = 6000; // per hour per instance
function allowGlobal(): boolean {
  const now = Date.now();
  if (now - windowStart > 3600_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= GLOBAL_MAX) return false;
  windowCount += 1;
  return true;
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Translation is temporarily unavailable." },
      { status: 500 }
    );
  }

  if (!allowGlobal()) {
    return NextResponse.json(
      {
        error:
          "The live demo is busy right now. Try again shortly, or sign up free for the full app.",
      },
      { status: 503 }
    );
  }

  if (!allowIp(clientIp(req))) {
    return NextResponse.json(
      { error: "Trial limit reached — sign up free to keep going." },
      { status: 429 }
    );
  }

  let body: { text?: string; source?: string; target?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const target = typeof body.target === "string" ? body.target : "";
  const source = typeof body.source === "string" ? body.source : undefined;

  if (!text) return NextResponse.json({ error: "Missing text." }, { status: 400 });
  if (text.length > MAX_TEXT)
    return NextResponse.json({ error: "Segment too long for the trial." }, { status: 413 });
  if (!LANG_NAME.has(target))
    return NextResponse.json({ error: "Unsupported target language." }, { status: 400 });
  if (source && source === target)
    return NextResponse.json({ translatedText: text });

  const targetName = LANG_NAME.get(target)!;
  const sourceName = source ? LANG_NAME.get(source) ?? "the source language" : "the source language";

  // IDENTICAL prompt to the authenticated app (/api/translate): same engine
  // persona, same general rules, same Islamic terminology + few-shot examples.
  // Only the app's context/merge protocol is omitted — the trial sends no prior
  // context and cannot render a merge. Built from @/lib/translation-prompt so
  // the two paths can never silently drift apart again.
  const system = `${TRANSLATION_CORE_PROMPT}

${ISLAMIC_TERMINOLOGY_RULES}

${ISLAMIC_FEW_SHOT_EXAMPLES}`;

  try {
    const callAnthropic = () => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        // 500 matches the app's Haiku budget. A citation-heavy Arabic/Urdu
        // rendering of a 280-char segment can approach 400 tokens; truncating
        // mid-sentence in a public demo reads as broken.
        max_tokens: 500,
        // Cache the prompt prefix. The system prompt is now the app's full
        // prompt (~6k tokens); without caching that would multiply the cost of
        // every anonymous trial call. With it, repeat calls inside the 5-minute
        // window bill the prefix at ~10% — the same lever /api/translate uses.
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
        // Frame the segment as a translation TASK. Sending the raw spoken text
        // as a BARE user turn is what made the model answer the visitor
        // conversationally ("I'm here to help with translations…") instead of
        // translating it. Shared with the app so both frame identically.
        messages: [
          {
            role: "user",
            content: buildTranslationUserMessage({
              text,
              sourceName,
              targetName,
            }),
          },
        ],
      }),
      cache: "no-store",
      // Without a timeout a stalled Anthropic connection hangs for the whole
      // serverless function budget while the 60s trial clock runs out and the
      // segment sits on "…translating". Abort at 15s → the catch below returns
      // the generic 502 the client already handles.
      signal: AbortSignal.timeout(15_000),
    });

    // One retry with a short backoff on a transient upstream blip (429 rate
    // limit / 5xx overloaded), mirroring /api/translate: a single Anthropic
    // hiccup must not permanently break a demo segment. A timeout/abort throws
    // instead and is deliberately NOT retried — it would double the wait while
    // the visitor's 60s trial clock runs.
    let resp = await callAnthropic();
    if (resp.status === 429 || resp.status >= 500) {
      await new Promise((r) => setTimeout(r, 400));
      resp = await callAnthropic();
    }
    if (!resp.ok) {
      console.error("trial translate upstream error", resp.status);
      return NextResponse.json({ error: "Translation hiccup — try again." }, { status: 502 });
    }
    const data = await resp.json();
    // Take the first TEXT block rather than assuming index 0 — if the response
    // ever leads with a non-text block, index 0 would yield undefined and the
    // visitor would silently get a blank translation.
    const blocks: unknown = data?.content;
    const firstText = Array.isArray(blocks)
      ? blocks.find(
          (b): b is { type: string; text: string } =>
            !!b &&
            typeof b === "object" &&
            (b as { type?: unknown }).type === "text" &&
            typeof (b as { text?: unknown }).text === "string"
        )?.text
      : undefined;
    const raw = (firstText ?? "").trim();
    // Same hard guard as the authenticated /api/translate path: the model must
    // NEVER surface first-person meta-commentary about the input ("I'm not
    // recognizing this as coherent Arabic…"). It usually obeys the prompt, but
    // on off-language/transliterated STT it occasionally leaks an explanation —
    // and this is the public landing "Try it live" demo, a visitor's first
    // impression. If it looks like commentary, blank it (the trial has no source
    // card to fall back to, so a blank translation is the correct outcome).
    // <<<OFFLANG>>> is a CONTROL TOKEN from the shared prompt (the model emits
    // it for foreign-language speech). The app parses it out of the stream; the
    // trial has no marker parsing, so blank it here — it must never reach a
    // visitor's screen.
    // Tolerant marker test: a truncated/mangled emission ("<<OFFLANG", "<OFFLANG>>")
    // must not slip through as visible text. No legitimate translation contains
    // this token in any form, so matching loosely is safe here.
    const looksOffLang =
      raw.includes(OFFLANG_MARKER) || /<{1,3}\s*OFFLANG/i.test(raw);
    if (looksOffLang || looksLikeMetaCommentary(raw)) {
      return NextResponse.json({ translatedText: "" });
    }

    // Citation verification — the terminology rules PROMISE the model that its
    // Quran/hadith references are checked server-side after it responds, and the
    // app delivers on that (/api/translate runs the same two calls). Without it
    // the public demo could show a hallucinated hadith number, which for this
    // audience is worse than showing no citation at all. Both helpers are
    // key-free, in-memory cached, and self-abort at 3s; a failure inside them
    // falls back to the unenriched text rather than failing the segment.
    let translatedText = raw;
    try {
      const hadithEnriched = await verifyAndEnrich(translatedText);
      const quranEnriched = await verifyAndEnrichQuran(hadithEnriched.text, target);
      translatedText = quranEnriched.text;
    } catch {
      /* enrichment is best-effort — keep the plain translation */
    }
    return NextResponse.json({ translatedText });
  } catch (e) {
    console.error("trial translate error", e);
    return NextResponse.json({ error: "Translation hiccup — try again." }, { status: 502 });
  }
}
