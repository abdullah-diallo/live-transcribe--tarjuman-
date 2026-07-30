"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { COLORS } from "@/lib/constants";
import { BILLING_ENABLED } from "../../../convex/billingLimits";
import { Icon } from "@/components/shared/icon";
import { Skeleton } from "@/components/shared/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UpgradeCard } from "@/components/billing/upgrade-card";
import { AnimateIn } from "@/components/recording/animate-in";
import { AskEmpty } from "@/components/ask/ask-empty";
import { AskComposer } from "@/components/ask/ask-composer";
import { TypingDots } from "@/components/ask/typing-dots";
import { UserBubble, AssistantMessage } from "@/components/ask/ask-message";
import { useChatStream, type ChatCitation } from "@/hooks/use-chat-stream";
import { useStickyBottom } from "@/hooks/use-sticky-bottom";
import { usePlan } from "@/hooks/use-plan";
import { useLocale } from "@/lib/i18n/locale-context";

export function AskScreen() {
  const { t, locale } = useLocale();
  const plan = usePlan();
  const locked = BILLING_ENABLED && plan?.plan !== "pro";

  // `undefined` while the query resolves; `null` once we know there is no chat
  // yet. The screen opens into the user's most recent conversation.
  const currentChat = useQuery(api.chats.getCurrentChat, {});
  const [explicitChatId, setExplicitChatId] = useState<Id<"chats"> | null>(null);
  const [startedFresh, setStartedFresh] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  // Derived rather than synced through an effect: the active chat is whichever
  // one we've explicitly landed on, else the server's most recent — unless the
  // user asked for a fresh one, in which case there is no chat until their
  // first message creates it.
  const chatId: Id<"chats"> | null =
    explicitChatId ?? (startedFresh ? null : (currentChat?._id ?? null));

  const messages = useQuery(
    api.chats.listMessages,
    chatId ? { chatId } : "skip"
  );

  const onChatCreated = useCallback((id: Id<"chats">) => {
    setExplicitChatId(id);
    setStartedFresh(false);
  }, []);

  const { streaming, error, send, clearError } = useChatStream(
    chatId,
    onChatCreated,
    locale
  );

  const { scrollRef, onScroll, isStuck, scrollToBottom } =
    useStickyBottom<HTMLDivElement>(200);

  // First resolve of a persisted thread: jump instantly. The hook's layout
  // effect would otherwise kick the eased rAF glide and fly the user through
  // their entire history over about a second on every single mount.
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (jumpedRef.current || messages === undefined) return;
    jumpedRef.current = true;
    scrollToBottom(false);
  }, [messages, scrollToBottom]);

  // Messages already present when the thread first resolves render WITHOUT
  // entrance motion; anything appended afterwards animates in. Without this,
  // opening the tab replays the entire history as a cascade of simultaneous
  // anime.js instances. Captured in an effect (not during render) so it stays
  // safe under concurrent rendering — `preloaded === null` on that first paint
  // means nothing animates, which is exactly the intent.
  const [preloaded, setPreloaded] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (preloaded !== null || messages === undefined) return;
    setPreloaded(new Set(messages.map((m) => m._id)));
  }, [messages, preloaded]);
  const isNew = (id: string) => preloaded !== null && !preloaded.has(id);

  const handleSend = useCallback(
    (text: string) => {
      clearError();
      void send(text);
      scrollToBottom();
    },
    [send, clearError, scrollToBottom]
  );

  const startNewChat = () => {
    setExplicitChatId(null);
    setStartedFresh(true);
    setPreloaded(null);
    jumpedRef.current = false;
    clearError();
  };

  const loading = chatId !== null && messages === undefined;
  const isEmpty = !loading && (messages?.length ?? 0) === 0 && !streaming;
  const canStartNew = (messages?.length ?? 0) > 0 && !streaming;

  if (locked) {
    return (
      <div className="flex flex-col flex-1 px-5 pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+84px)]">
        <div className="section-label mb-1">{t("nav.ask")}</div>
        <div className="text-2xl font-bold mb-5" style={{ color: COLORS.w }}>
          {t("ask.title")}
        </div>
        <UpgradeCard title={t("ask.proTitle")} message={t("ask.proBody")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 lg:max-w-3xl lg:mx-auto lg:w-full">
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: `1px solid ${COLORS.border}` }}
      >
        <div>
          <div className="section-label">{t("nav.ask")}</div>
          <div className="text-[17px] font-bold" style={{ color: COLORS.w }}>
            {t("ask.title")}
          </div>
        </div>
        {canStartNew && (
          <button
            onClick={() => setConfirmNew(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12.5px] font-semibold border border-transparent transition-all duration-200 hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] hover:shadow-[0_0_16px_rgba(46,204,113,0.35)]"
            style={{ background: COLORS.surface, color: COLORS.t2 }}
          >
            <Icon name="edit" size={13} color={COLORS.t2} />
            {t("ask.newChat")}
          </button>
        )}
      </div>

      {/* Thread */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto px-4 py-4"
        >
          <div className="flex flex-col gap-3">
            {/* Scrolls away with the conversation — the always-on version lives
                under the composer. */}
            <div
              className="rounded-2xl px-4 py-3 mb-1"
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.amber}30`,
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon name="doc" size={13} color={COLORS.amber} />
                <span
                  className="text-[12px] font-bold"
                  style={{ color: COLORS.amber }}
                >
                  {t("ask.disclaimerTitle")}
                </span>
              </div>
              <div
                className="text-[12px] leading-relaxed"
                style={{ color: COLORS.t3 }}
              >
                {t("ask.disclaimerBody")}
              </div>
            </div>

            {loading && (
              <>
                <Skeleton className="h-10 w-2/3 ms-auto rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </>
            )}

            {isEmpty && <AskEmpty onPick={handleSend} />}

            {messages?.map((m) => {
              const body =
                m.role === "user" ? (
                  <UserBubble text={m.content} />
                ) : (
                  <AssistantMessage
                    text={m.content}
                    citations={m.citations as ChatCitation[] | undefined}
                    truncated={m.finish === "truncated"}
                  />
                );
              return isNew(m._id) ? (
                <AnimateIn
                  key={m._id}
                  variant={m.role === "user" ? "source" : "translation"}
                >
                  {body}
                </AnimateIn>
              ) : (
                <div key={m._id}>{body}</div>
              );
            })}

            {/* Optimistic in-flight turn, overlaid until Convex catches up. */}
            {streaming && (
              <>
                <UserBubble text={streaming.question} />
                {streaming.phase === "waiting" ? (
                  <TypingDots />
                ) : (
                  <AssistantMessage
                    text={streaming.text}
                    streaming={streaming.phase === "streaming"}
                    verifying={streaming.phase === "verifying"}
                  />
                )}
              </>
            )}

            {error && (
              <div
                className="rounded-2xl px-4 py-3"
                role="alert"
                style={{
                  // Amber, not red, when it's a rate limit: "slow down" is not
                  // the same message as "something broke".
                  background: error.retryAfterSec
                    ? COLORS.amberSoft
                    : COLORS.redSoft,
                  border: `1px solid ${
                    error.retryAfterSec ? COLORS.amber : COLORS.red
                  }40`,
                }}
              >
                <div
                  className="section-label mb-1"
                  style={{
                    color: error.retryAfterSec ? COLORS.amber : COLORS.red,
                  }}
                >
                  {t("ask.errorTitle")}
                </div>
                <div className="text-[13px]" style={{ color: COLORS.t2 }}>
                  {error.message}
                </div>
                {!error.retryAfterSec && (
                  <button
                    onClick={() => handleSend(error.question)}
                    className="mt-2 text-[12.5px] font-semibold underline"
                    style={{ color: COLORS.accent }}
                  >
                    {t("ask.retry")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Re-engage pill. Absolute inside this relative wrapper, never fixed —
            the (app) template holds a transform for 200ms on every navigation,
            which would reposition a fixed descendant. */}
        {!isStuck && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute left-1/2 bottom-3 -translate-x-1/2 flex items-center gap-1 h-8 px-3 rounded-full text-[12px] font-semibold animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{
              background: COLORS.surfaceLight,
              color: COLORS.accent,
              border: `1px solid ${COLORS.accent}`,
              boxShadow: "0 0 16px rgba(46,204,113,0.35)",
            }}
          >
            <Icon name="chevron" size={12} color={COLORS.accent} />
            {t("ask.latest")}
          </button>
        )}
      </div>

      <AskComposer onSend={handleSend} busy={Boolean(streaming)} />

      <ConfirmDialog
        open={confirmNew}
        onOpenChange={setConfirmNew}
        title={t("ask.clearTitle")}
        message={t("ask.clearBody")}
        confirmLabel={t("ask.newChat")}
        onConfirm={startNewChat}
      />
    </div>
  );
}
