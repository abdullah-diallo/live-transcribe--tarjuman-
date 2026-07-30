"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { streamText } from "@/lib/stream-text";
import { META_SENTINEL } from "@/lib/stream-protocol";

export interface ChatCitation {
  source: "sunnah" | "quran";
  label: string;
  url: string;
  verified: boolean;
}

/** The in-flight assistant turn, overlaid on top of the persisted messages. */
export interface StreamingState {
  /** Echo of the user's question, rendered optimistically before Convex lands. */
  question: string;
  text: string;
  phase: "waiting" | "streaming" | "verifying";
}

export interface ChatError {
  message: string;
  /** Present on a 429 so the composer can show a countdown instead of an error. */
  retryAfterSec?: number;
  /** The question that failed, so "Try again" can re-send it. */
  question: string;
}

// Two-pump typewriter, lifted from the summary flow in session-body.tsx.
//
// Anthropic's SSE arrives lumpy — often a whole clause or sentence per event.
// Rendering each chunk the moment it lands drops text in 40-80px blocks, and
// because useStickyBottom eases toward a moving target, every block jump makes
// the auto-scroll visibly lurch to catch up. Draining a buffer at a steady
// 60fps instead is what makes the summary feel considered and the old ephemeral
// Ask-the-lecture box feel like an output dump.
const TICK_MS = 16;
const MIN_PER_TICK = 10; // ~625 chars/sec floor — smooth, never a crawl
const MAX_PER_TICK = 48; // cap so a burst flows in rather than dumping at once

/**
 * Drives one Ask Tarjuman conversation: persist the user's turn, stream the
 * answer, swap in the citation-verified text, persist the result.
 *
 * The request body carries only a chatId — the server rebuilds the model's
 * context from Convex. See src/app/api/chat/route.ts for why.
 */
export function useChatStream(
  chatId: Id<"chats"> | null,
  onChatCreated: (id: Id<"chats">) => void,
  locale: string
) {
  const authToken = useAuthToken();
  const appendUser = useMutation(api.chats.appendUserMessage);
  const appendAssistant = useMutation(api.chats.appendAssistantMessage);

  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [error, setError] = useState<ChatError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort on unmount. The (app) template unmounts the page on every navigation,
  // and without this the server keeps generating to the full token budget for
  // output nobody will ever see — burning Opus tokens for nothing.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setStreaming({ question: text, text: "", phase: "waiting" });

      // Stable across retries so a double-tapped Send or a re-fired persist
      // can't create a duplicate bubble (Convex dedupes on it).
      const userClientId = crypto.randomUUID();
      const assistantClientId = crypto.randomUUID();

      let activeChatId = chatId;
      try {
        const res = await appendUser({
          chatId: activeChatId ?? undefined,
          clientId: userClientId,
          content: text,
        });
        activeChatId = res.chatId;
        if (res.chatId !== chatId) onChatCreated(res.chatId);
      } catch (e) {
        setStreaming(null);
        setError({
          message: e instanceof Error ? e.message : "Couldn't send that.",
          question: text,
        });
        return;
      }

      let timer: ReturnType<typeof setInterval> | null = null;
      let buffer = ""; // received but not yet revealed
      let displayed = "";
      let streamDone = false;

      try {
        // The drain pump starts BEFORE the fetch resolves, so the first token
        // begins gliding the instant it lands.
        const drain = new Promise<void>((resolve) => {
          timer = setInterval(() => {
            if (buffer.length > 0) {
              const take = Math.min(
                buffer.length,
                Math.max(MIN_PER_TICK, Math.ceil(buffer.length / 6)),
                MAX_PER_TICK
              );
              displayed += buffer.slice(0, take);
              buffer = buffer.slice(take);
              setStreaming({
                question: text,
                text: displayed,
                phase: "streaming",
              });
            } else if (streamDone) {
              if (timer) clearInterval(timer);
              timer = null;
              resolve();
            }
          }, TICK_MS);
        });

        // The read pump. streamText hands back the ACCUMULATED text, so diff.
        let seen = 0;
        let raw = "";
        const read = streamText(
          "/api/chat",
          { chatId: activeChatId, targetLanguage: locale },
          authToken,
          (all) => {
            raw = all;
            // Hold back the tail so a sentinel split across two network chunks
            // never flashes on screen as garbage.
            const safeEnd = Math.max(0, all.length - META_SENTINEL.length);
            const sentinelAt = all.indexOf(META_SENTINEL);
            const visibleEnd = sentinelAt === -1 ? safeEnd : sentinelAt;
            if (visibleEnd > seen) {
              buffer += all.slice(seen, visibleEnd);
              seen = visibleEnd;
            }
          },
          controller.signal
        ).finally(() => {
          streamDone = true;
        });

        await Promise.all([read, drain]);

        // Flush anything the hold-back withheld.
        const sentinelAt = raw.indexOf(META_SENTINEL);
        const finalVisible = sentinelAt === -1 ? raw : raw.slice(0, sentinelAt);
        if (finalVisible.length > displayed.length) {
          displayed = finalVisible;
        }

        let finalText = displayed;
        let citations: ChatCitation[] | undefined;
        let truncated = false;
        if (sentinelAt !== -1) {
          setStreaming({ question: text, text: displayed, phase: "verifying" });
          try {
            const meta = JSON.parse(
              raw.slice(sentinelAt + META_SENTINEL.length)
            ) as { text?: string; truncated?: boolean; citations?: ChatCitation[] };
            if (meta.text) finalText = meta.text;
            citations = meta.citations;
            truncated = Boolean(meta.truncated);
          } catch {
            // Malformed trailer — keep the streamed text rather than losing the
            // answer. Citations stay un-enriched; nothing is presented as
            // verified that wasn't.
          }
        }

        await appendAssistant({
          chatId: activeChatId,
          clientId: assistantClientId,
          content: finalText,
          finish: truncated ? "truncated" : "ok",
          model: "claude-opus-4-8",
          citations,
        });
        setStreaming(null);
      } catch (e) {
        if (timer) clearInterval(timer);
        const aborted =
          e instanceof DOMException && e.name === "AbortError";
        if (aborted) {
          // Navigated away mid-answer. Persist whatever arrived and MARK it —
          // otherwise the turn is lost and the thread ends on a dangling
          // question with no reply.
          if (displayed.trim()) {
            void appendAssistant({
              chatId: activeChatId,
              clientId: assistantClientId,
              content: displayed,
              finish: "truncated",
              model: "claude-opus-4-8",
            });
          }
          setStreaming(null);
          return;
        }
        setStreaming(null);
        const msg = e instanceof Error ? e.message : String(e);
        const min = msg.match(/try again in (\d+) min/i);
        setError({
          message: msg,
          retryAfterSec: min ? Number(min[1]) * 60 : undefined,
          question: text,
        });
      }
    },
    [chatId, onChatCreated, appendUser, appendAssistant, authToken, locale]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const clearError = useCallback(() => setError(null), []);

  return { streaming, error, send, stop, clearError };
}
