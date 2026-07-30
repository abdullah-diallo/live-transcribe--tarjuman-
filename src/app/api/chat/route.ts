import { NextRequest, NextResponse } from "next/server";
import { ISLAMIC_CHAT_SYSTEM } from "@/lib/islamic-chat-prompt";
import {
  requireAuthFromHeader,
  checkRateLimit,
  getUsageFromHeader,
  getChatHistoryFromHeader,
} from "@/lib/api-auth";
import {
  streamAnthropicText,
  LANGUAGE_NAMES,
  type AnthropicMessage,
} from "@/lib/anthropic-stream";
import { verifyAndEnrich } from "@/lib/sunnah";
import { verifyAndEnrichQuran } from "@/lib/quran";
import { BILLING_ENABLED } from "../../../../convex/billingLimits";

/**
 * Ask Tarjuman — the Islamic AI chat endpoint.
 *
 * THE REQUEST BODY DOES NOT CONTAIN THE MESSAGE. The client persists the user's
 * turn to Convex first, then POSTs only `{chatId}`; this route reconstructs the
 * conversation server-side via getChatHistoryFromHeader. That is the central
 * design decision of the feature:
 *
 *  - Abuse: a valid token can't inject 900K tokens of arbitrary text into an
 *    Opus 4.8 call. Every length cap is enforced at write time in a mutation.
 *  - Correctness: the persisted transcript is provably what the model saw.
 *  - Cache: the prefix is server-derived and deterministic. Client-supplied
 *    history would drift on any reordering and silently kill the message-tier
 *    prompt cache.
 *
 * Costs one extra Convex round-trip (~30-60ms) per message. Worth it.
 */

const MODEL = "claude-opus-4-8";

/** Per-citation network budget for the post-stream verification pass. */
const VERIFY_TIMEOUT_MS = 8_000;

/**
 * Questions where a wrong answer costs the most — someone acting on a ruling
 * about their marriage, their money, or their worship. Escalate reasoning
 * effort for these and leave everything else at `medium`.
 *
 * Same escalation idiom as /api/translate's Haiku->Sonnet marker routing, but
 * applied to effort rather than model. Deterministic, ~20 lines, and it puts
 * the extra thinking tokens exactly where they pay for themselves.
 */
const RULING_MARKERS: RegExp[] = [
  /\b(?:is|are)\s+(?:it|this|that|they)\s+(?:halal|haram|permissible|allowed|valid)\b/i,
  /\b(?:ruling|hukm|fatwa|verdict)\s+(?:on|for|about)\b/i,
  /\b(?:halal|haram|makruh|mustahabb|wajib|fard)\b/i,
  /\b(?:talaq|divorce|khula|nikah|mahr|iddah)\b/i,
  /\b(?:inheritance|mirath|faraid)\b/i,
  /\b(?:zakat|zakah)\s+(?:on|for|calculat)/i,
  /\b(?:riba|usury|interest|mortgage|insurance)\b/i,
  /\b(?:kaffarah|expiation|oath|vow|nadhr)\b/i,
  /\b(?:qada|make[-\s]?up)\s+(?:prayer|salah|salat|fast|sawm)\b/i,
];

function effortFor(question: string): "medium" | "high" {
  return RULING_MARKERS.some((re) => re.test(question)) ? "high" : "medium";
}

/**
 * Anthropic rejects consecutive same-role turns. Our history can contain them
 * if an assistant turn failed and the user re-asked, so merge rather than 400.
 */
function collapseConsecutive(
  messages: { role: "user" | "assistant"; content: string }[]
): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role && typeof prev.content === "string") {
      prev.content = `${prev.content}\n\n${m.content}`;
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  const auth = await requireAuthFromHeader(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Sign in to use Ask Tarjuman." },
      { status: 401 }
    );
  }

  const limit = checkRateLimit(auth.userId, "chat");
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `You're sending messages faster than I can answer — try again in ${Math.ceil(limit.retryAfterSec / 60)} min.`,
        retryAfterSec: limit.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const usage = await getUsageFromHeader(req);
  if (BILLING_ENABLED && usage && usage.plan !== "pro") {
    return NextResponse.json(
      { error: "Ask Tarjuman is a Tarjuman Pro feature.", code: "pro_only" },
      { status: 402 }
    );
  }

  let body: { chatId?: string; targetLanguage?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { chatId, targetLanguage = "en" } = body;
  if (!chatId || typeof chatId !== "string") {
    return NextResponse.json({ error: "Missing `chatId`" }, { status: 400 });
  }
  if (chatId.length > 64) {
    return NextResponse.json({ error: "Invalid `chatId`" }, { status: 400 });
  }

  const history = await getChatHistoryFromHeader(req, chatId);
  if (!history.ok) {
    return history.reason === "not_found"
      ? NextResponse.json(
          { error: "Conversation not found." },
          { status: 404 }
        )
      : NextResponse.json(
          { error: "Chat is temporarily unavailable. Try again." },
          { status: 503 }
        );
  }

  const messages = collapseConsecutive(history.messages);
  const last = messages[messages.length - 1];
  // Never bill an Opus call for a no-op turn (e.g. a double-fired request after
  // the answer already persisted).
  if (!last || last.role !== "user" || typeof last.content !== "string") {
    return NextResponse.json({ error: "Nothing to answer yet." }, { status: 409 });
  }

  const lang = LANGUAGE_NAMES[targetLanguage] ?? "English";
  // Language belongs in a per-request turn, NOT in the system prompt — the
  // system block must stay byte-identical across all users or the org-wide
  // prompt cache fragments into one entry per language.
  const withLanguage: AnthropicMessage[] =
    lang === "English"
      ? messages
      : [
          ...messages.slice(0, -1),
          {
            role: "user" as const,
            content: `${last.content}\n\n(Answer in ${lang}.)`,
          },
        ];

  return streamAnthropicText({
    apiKey,
    system: ISLAMIC_CHAT_SYSTEM,
    messages: withLanguage,
    model: MODEL,
    // MUST be explicit on Opus 4.8 — omitting `thinking` runs the model with
    // thinking OFF, and 4.8 then writes its reasoning into the visible answer.
    thinking: { type: "adaptive" },
    outputConfig: { effort: effortFor(last.content) },
    // Room for adaptive thinking (~2000) plus the answer. Thinking bills into
    // max_tokens, so sizing this like a 250-word answer would truncate.
    maxTokens: 4000,
    timeoutMs: 180_000,
    cacheLastMessage: true,
    // The system block is identical bytes for every user and every chat, and
    // Anthropic's cache is org-scoped by prefix — one 1-hour write serves the
    // whole user base. Highest-leverage cache in the app.
    systemCacheTtl: "1h",
    truncationNotice:
      "\n\n---\n⚠️ This answer was cut off at the maximum length. Ask a narrower follow-up for the rest.",
    logTag: "chat",
    // Citation verification runs HERE, in-band, rather than as a follow-up
    // client call like the summary flow. In chat the answer is persisted: a
    // follow-up that fails (offline, tab closed, 429) would write a fabricated
    // hadith number to the database permanently and render it as authentic.
    // Stripping has to be non-skippable. The system prompt also promises the
    // model that its citations are verified — that promise is load-bearing.
    onComplete: async (fullText, stopReason) => {
      // 8s per lookup, not the 3s default. This runs AFTER the answer has
      // finished streaming — the user is already reading — so latency here is
      // nearly free, whereas a timeout marks a genuine hadith "— unverified"
      // and teaches users to ignore the one marker protecting them from a
      // fabricated one.
      const h = await verifyAndEnrich(fullText, VERIFY_TIMEOUT_MS);
      const q = await verifyAndEnrichQuran(
        h.text,
        targetLanguage,
        VERIFY_TIMEOUT_MS
      );
      return {
        text: q.text,
        truncated: stopReason === "max_tokens",
        citations: [
          ...h.citations.map((c) => ({
            source: "sunnah" as const,
            label: `${c.collectionDisplay} ${c.number}`,
            url: c.url,
            verified: c.verified,
          })),
          ...q.citations.map((c) => ({
            source: "quran" as const,
            label: `Quran ${c.surahDisplay}:${c.ayahNumber}`,
            url: c.url,
            verified: c.verified,
          })),
        ],
      };
    },
  });
}
