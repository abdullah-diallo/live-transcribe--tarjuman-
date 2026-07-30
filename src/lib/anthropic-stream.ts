import { NextResponse } from "next/server";

/**
 * Shared Anthropic streaming helper for the AI API routes (study-notes, ask,
 * translate-transcript, chat). Opens a streaming Messages request, parses
 * Anthropic's SSE, and re-emits just the text deltas as plain UTF-8 the browser
 * reads directly — the same shape /api/summarize uses. Returns either the
 * streaming Response or a JSON error Response (so routes can `return` it as-is).
 *
 * The system prompt is sent with `cache_control: ephemeral` so the shared
 * Islamic-terminology block is cached across a session once it clears the
 * caching threshold.
 *
 * NOTE ON EXTENDING THIS: every option added for the chat route is spread only
 * when defined, so the three pre-existing callers still produce a BYTE-IDENTICAL
 * request body. That is not cosmetic — Anthropic's cache is keyed on the
 * serialized prefix, so any stray field would invalidate their live prompt
 * caches on deploy. Preserve that property.
 */

// Re-exported for server-side callers. The definition lives in the
// dependency-free @/lib/stream-protocol so client hooks can import it without
// dragging `next/server` into the browser bundle.
export { META_SENTINEL } from "./stream-protocol";
import { META_SENTINEL } from "./stream-protocol";

export interface AnthropicTextBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral"; ttl?: "1h" };
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicTextBlock[];
}

export async function streamAnthropicText(opts: {
  apiKey: string;
  system: string;
  /** Single-turn shorthand. Ignored when `messages` is present. */
  userMessage?: string;
  /** Full multi-turn conversation. `messages[0].role` must be "user". */
  messages?: AnthropicMessage[];
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  /**
   * Claude Opus 4.8 requires this EXPLICITLY — omitting `thinking` runs the
   * model with thinking OFF, and 4.8 then leaks its reasoning into the visible
   * answer. `{type: "enabled", budget_tokens: N}` returns a 400 on 4.8; adaptive
   * is the only on-mode. `display` defaults to "omitted", meaning thinking
   * blocks stream with empty text — which is what we want, since this pipe
   * carries the persisted answer and nothing else.
   */
  thinking?: { type: "adaptive"; display?: "omitted" | "summarized" };
  /** `effort` defaults to "high" on Opus 4.8. Rejected on Sonnet 4.5 / Haiku. */
  outputConfig?: { effort?: "low" | "medium" | "high" | "xhigh" | "max" };
  /** "1h" doubles the cache-write cost but survives real conversation gaps. */
  systemCacheTtl?: "1h";
  /**
   * Add a second cache breakpoint on the final message, so the whole
   * conversation prefix through this turn is a cache READ on the next turn.
   * No-op for the `userMessage` shorthand.
   */
  cacheLastMessage?: boolean;
  /** Appended verbatim when stop_reason === "max_tokens". */
  truncationNotice?: string;
  /**
   * Runs on the COMPLETE text once the stream closes; the returned object is
   * emitted as `META_SENTINEL + JSON.stringify(meta)`. This is how the chat
   * route runs citation verification without buffering the answer off the live
   * path — deltas stream immediately, enrichment lands as a trailer.
   *
   * Providing this makes the helper accumulate the full text (bounded by
   * maxTokens). Omit it and memory behaviour is unchanged.
   */
  onComplete?: (
    fullText: string,
    stopReason: string | null
  ) => Promise<Record<string, unknown>>;
  /** Label for server-side error logs. */
  logTag: string;
}): Promise<Response> {
  const msgs: AnthropicMessage[] = opts.messages?.length
    ? opts.messages
    : [{ role: "user", content: opts.userMessage ?? "" }];

  // Second cache breakpoint: wrap the last message's content in block form so
  // the conversation prefix through this turn is cached and read next turn.
  const outbound: AnthropicMessage[] =
    opts.cacheLastMessage && opts.messages?.length
      ? msgs.map((m, i) =>
          i === msgs.length - 1 && typeof m.content === "string"
            ? {
                role: m.role,
                content: [
                  {
                    type: "text" as const,
                    text: m.content,
                    cache_control: { type: "ephemeral" as const },
                  },
                ],
              }
            : m
        )
      : msgs;

  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model ?? "claude-sonnet-5",
        max_tokens: opts.maxTokens ?? 2000,
        stream: true,
        system: [
          {
            type: "text",
            text: opts.system,
            cache_control: opts.systemCacheTtl
              ? { type: "ephemeral", ttl: opts.systemCacheTtl }
              : { type: "ephemeral" },
          },
        ],
        messages: outbound,
        // Spread-only-when-defined keeps the pre-existing callers byte-identical.
        ...(opts.thinking ? { thinking: opts.thinking } : {}),
        ...(opts.outputConfig ? { output_config: opts.outputConfig } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `AI failed: ${msg}` }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    console.error(
      `[${opts.logTag}] upstream HTTP ${upstream.status}: ${errText.slice(0, 300)}`
    );
    return NextResponse.json(
      { error: "AI temporarily unavailable." },
      { status: 502 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      // Capture WHY the model stopped. "max_tokens" means the output was
      // truncated mid-answer — without surfacing it, a 2h-transcript
      // translation that stops at the ⅓ mark renders as if it were the
      // complete result, silently losing the majority of the lecture.
      let stopReason: string | null = null;
      // Only accumulated when a caller needs the whole text for a trailer.
      let fullText = "";
      const wantsFullText = Boolean(opts.onComplete);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (!json || json === "[DONE]") continue;
            try {
              const evt = JSON.parse(json);
              // Anthropic can emit an `error` event mid-stream on upstream
              // trouble — propagate it instead of silently ending the output.
              if (evt.type === "error") {
                controller.error(
                  new Error(evt.error?.message ?? "AI stream error")
                );
                return;
              }
              // Cache telemetry. On Opus 4.8 the prompt-cache floor is 4096
              // tokens and falling under it is a SILENT no-op — no error, just
              // roughly a 2x input bill. `cr` (cache_read) staying 0 across
              // repeated requests is the only signal that something invalidated
              // the prefix. Cheap to log, expensive to miss.
              if (evt.type === "message_start") {
                const u = evt.message?.usage;
                console.log(
                  `[${opts.logTag}] usage in=${u?.input_tokens ?? "?"} cw=${u?.cache_creation_input_tokens ?? "?"} cr=${u?.cache_read_input_tokens ?? "?"}`
                );
              }
              if (
                evt.type === "message_delta" &&
                typeof evt.delta?.stop_reason === "string"
              ) {
                stopReason = evt.delta.stop_reason;
              }
              // Note: `thinking_delta` blocks fall through here untouched, so
              // adaptive thinking needs no parser change — reasoning never
              // reaches the client or the persisted answer.
              if (
                evt.type === "content_block_delta" &&
                evt.delta?.type === "text_delta" &&
                typeof evt.delta.text === "string"
              ) {
                if (wantsFullText) fullText += evt.delta.text;
                controller.enqueue(encoder.encode(evt.delta.text));
              }
            } catch {
              /* ignore malformed line */
            }
          }
        }
      } catch (e) {
        controller.error(e);
        return;
      }
      // Truncated by the token cap — append a visible marker so the user knows
      // it's incomplete and can regenerate in smaller parts. Appended to
      // `fullText` BEFORE onComplete runs, so a truncated answer still has its
      // citations verified and the persisted copy carries the warning.
      if (stopReason === "max_tokens") {
        const notice =
          opts.truncationNotice ??
          "\n\n---\n⚠️ This response was cut off because it reached the maximum length. For a very long transcript, translate or summarize it in shorter sections.";
        if (wantsFullText) fullText += notice;
        controller.enqueue(encoder.encode(notice));
      }
      if (opts.onComplete) {
        try {
          const meta = await opts.onComplete(fullText, stopReason);
          controller.enqueue(
            encoder.encode(META_SENTINEL + JSON.stringify(meta))
          );
        } catch (e) {
          // Never fail the whole answer because enrichment failed — the user
          // already has the text on screen. The client falls back to what it
          // streamed when no trailer arrives.
          console.error(
            `[${opts.logTag}] onComplete failed: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

/** Human-readable language names for building AI prompts, matching the app set. */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese",
  it: "Italian", nl: "Dutch", ru: "Russian", hi: "Hindi", ja: "Japanese",
  ar: "Arabic", ur: "Urdu", ko: "Korean", zh: "Chinese", vi: "Vietnamese",
  id: "Indonesian", ms: "Malay", tr: "Turkish", pl: "Polish", cs: "Czech",
  hu: "Hungarian", no: "Norwegian", sv: "Swedish", da: "Danish", fi: "Finnish",
  el: "Greek", he: "Hebrew", ro: "Romanian", ca: "Catalan", uk: "Ukrainian",
  bn: "Bengali",
};
