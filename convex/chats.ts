import {
  mutation,
  query,
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { requireUserId } from "./authGuards";
import { truncateTitle } from "./sessions";
import { monthStartMs } from "./billingLimits";

/**
 * Ask Tarjuman — Islamic AI chat.
 *
 * Same ownership discipline as sessions.ts: mutations throw when
 * unauthenticated, queries return null/[] (the page may render before the auth
 * handshake completes), and every read of an existing chat validates
 * `chat.userId === userId`.
 *
 * The caps below live HERE, not in /api/chat, because the route never receives
 * the user's message text — the client persists the turn first and the route
 * POSTs only a chatId, so this module is the sole enforcement point. See
 * getHistoryForCompletion.
 */

const MAX_MESSAGE_CHARS = 4_000; // one user message
const MAX_MESSAGES_PER_CHAT = 400; // ~200 turns; start a new chat after
const HISTORY_MESSAGES = 24; // model context window, in messages
const HISTORY_CHAR_BUDGET = 120_000; // ~30-35K tokens of history, hard ceiling
const PREVIEW_CHARS = 200;
const PURGE_BATCH = 200;
const MAX_TITLE_CHARS = 120;

/**
 * Hard per-user monthly message ceiling. This is an ABUSE FUSE, not a product
 * limit — it is deliberately NOT gated on BILLING_ENABLED.
 *
 * The product gate for this feature is Pro-only, enforced in /api/chat. But
 * BILLING_ENABLED is currently false, so that gate is inert and every user is
 * effectively unlimited. The only other backstop is the in-memory token bucket
 * in src/lib/api-auth.ts, which resets on every deploy. Each message is a
 * Claude Opus 4.8 call with adaptive thinking (~$0.03), so an unattended loop
 * with a valid token can run up a five-figure bill across restarts. 300/month
 * is far above any genuine user and caps the worst case at ~$10/user/month.
 */
const MONTHLY_MESSAGE_FUSE = 300;

const citationValidator = v.object({
  source: v.union(v.literal("sunnah"), v.literal("quran")),
  label: v.string(),
  url: v.string(),
  verified: v.boolean(),
});

/**
 * Messages this user has sent+received this calendar month, capped at
 * `MONTHLY_MESSAGE_FUSE + 1`.
 *
 * BOUNDED on purpose: `.take(n)` stops reading at the ceiling, so the cost of
 * the check is constant regardless of how much history the user has. Never
 * `.collect().length` here — that reads every message the user has ever sent,
 * on every single send.
 */
async function messagesThisMonth(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<number> {
  const monthStart = monthStartMs(Date.now());
  const rows = await ctx.db
    .query("chatMessages")
    .withIndex("by_user_created", (q) =>
      q.eq("userId", userId).gte("createdAt", monthStart)
    )
    .take(MONTHLY_MESSAGE_FUSE + 1);
  return rows.length;
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export const appendUserMessage = mutation({
  args: {
    // Absent on the first message of a new chat — the chat is created here.
    chatId: v.optional(v.id("chats")),
    // Client-generated, stable across retries. Dedupes a double-tapped Send.
    clientId: v.string(),
    content: v.string(),
  },
  returns: v.object({
    chatId: v.id("chats"),
    messageId: v.id("chatMessages"),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const content = args.content.trim();
    if (!content) throw new Error("Message is empty");
    if (content.length > MAX_MESSAGE_CHARS) {
      throw new Error("Message too long");
    }

    // Abuse fuse — checked before any write so a runaway client can neither
    // persist nor trigger an Opus call past the ceiling.
    if ((await messagesThisMonth(ctx, userId)) >= MONTHLY_MESSAGE_FUSE) {
      throw new Error(
        "You've reached this month's message limit. It resets at the start of next month."
      );
    }

    const now = Date.now();
    let chatId: Id<"chats">;

    if (args.chatId) {
      const chat = await ctx.db.get(args.chatId);
      if (!chat) throw new Error("Chat not found");
      if (chat.userId !== userId) throw new Error("Not your chat");
      if (chat.messageCount >= MAX_MESSAGES_PER_CHAT) {
        throw new Error("This conversation is full — start a new one.");
      }
      // Idempotency: a retried or double-tapped send replays the same clientId.
      const dup = await ctx.db
        .query("chatMessages")
        .withIndex("by_chat_client", (q) =>
          q.eq("chatId", args.chatId!).eq("clientId", args.clientId)
        )
        .first();
      if (dup) return { chatId: args.chatId, messageId: dup._id };

      chatId = args.chatId;
      await ctx.db.patch(chatId, {
        messageCount: chat.messageCount + 1,
        lastMessageAt: now,
        lastMessagePreview: content.slice(0, PREVIEW_CHARS),
        updatedAt: now,
      });
    } else {
      chatId = await ctx.db.insert("chats", {
        userId,
        title: truncateTitle(content) ?? undefined,
        firstMessageText: content,
        lastMessagePreview: content.slice(0, PREVIEW_CHARS),
        messageCount: 1,
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const messageId = await ctx.db.insert("chatMessages", {
      chatId,
      userId,
      role: "user",
      content,
      clientId: args.clientId,
      createdAt: now,
    });
    return { chatId, messageId };
  },
});

export const appendAssistantMessage = mutation({
  args: {
    chatId: v.id("chats"),
    clientId: v.string(),
    content: v.string(),
    finish: v.union(
      v.literal("ok"),
      v.literal("truncated"),
      v.literal("error")
    ),
    model: v.optional(v.string()),
    citations: v.optional(v.array(citationValidator)),
  },
  returns: v.id("chatMessages"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");
    if (chat.userId !== userId) throw new Error("Not your chat");

    const content = args.content.trim();
    // An empty answer is only legitimate on the error path (aborted stream,
    // upstream 502) — otherwise it would render as a blank bubble forever.
    if (!content && args.finish !== "error") {
      throw new Error("Empty assistant message");
    }

    // Idempotency: the client persists after the stream closes, and a retry
    // (offline blip, tab regaining focus) must not create a second bubble.
    const dup = await ctx.db
      .query("chatMessages")
      .withIndex("by_chat_client", (q) =>
        q.eq("chatId", args.chatId).eq("clientId", args.clientId)
      )
      .first();
    if (dup) return dup._id;

    const now = Date.now();
    const messageId = await ctx.db.insert("chatMessages", {
      chatId: args.chatId,
      userId,
      role: "assistant",
      content,
      clientId: args.clientId,
      model: args.model,
      finish: args.finish,
      citations: args.citations,
      createdAt: now,
    });
    await ctx.db.patch(args.chatId, {
      messageCount: chat.messageCount + 1,
      lastMessageAt: now,
      lastMessagePreview: content.slice(0, PREVIEW_CHARS),
      updatedAt: now,
    });
    return messageId;
  },
});

export const renameChat = mutation({
  args: { chatId: v.id("chats"), title: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");
    if (chat.userId !== userId) throw new Error("Not your chat");
    const title = args.title.trim().slice(0, MAX_TITLE_CHARS);
    await ctx.db.patch(args.chatId, {
      title: title || undefined,
      updatedAt: Date.now(),
    });
  },
});

export const deleteChat = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return;
    if (chat.userId !== userId) throw new Error("Not your chat");
    // Delete the parent FIRST so the chat disappears from the reactive UI
    // immediately; the orphaned messages are unreachable (every read goes
    // through the chat) and get drained below.
    await ctx.db.delete(args.chatId);
    await ctx.scheduler.runAfter(0, internal.chats.purgeChatMessages, {
      chatId: args.chatId,
    });
  },
});

/**
 * Drain a deleted chat's messages in bounded batches.
 *
 * Deliberately NOT modelled on sessions.deleteSession, which does an unbounded
 * `.collect()` over transcriptSegments — that is already a latent
 * transaction-limit risk there and would be a live one here (a 400-message
 * chat). Each invocation stays inside Convex's per-transaction write budget
 * and self-reschedules until drained.
 */
export const purgeChatMessages = internalMutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .take(PURGE_BATCH);
    for (const r of rows) await ctx.db.delete(r._id);
    if (rows.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.chats.purgeChatMessages, {
        chatId: args.chatId,
      });
    }
  },
});

// ─── Queries ───────────────────────────────────────────────────────────────

/** The user's most recent chat, or null. This is what /ask opens into. */
export const getCurrentChat = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("chats")
      .withIndex("by_user_recent", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
  },
});

/**
 * Messages for a chat, oldest first.
 *
 * `chatId` is a raw string + normalizeId (not v.id) for the same reason
 * sessions.getSession is: a mangled id from a stale link must route to a
 * graceful empty state, not blow the argument validator into the client error
 * boundary.
 */
export const listMessages = query({
  args: { chatId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];
    const id = ctx.db.normalizeId("chats", args.chatId);
    if (!id) return [];
    const chat = await ctx.db.get(id);
    if (!chat || chat.userId !== userId) return [];

    // Newest-first take, then reverse — never .collect() an unbounded child.
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_chat", (q) => q.eq("chatId", id))
      .order("desc")
      .take(Math.min(args.limit ?? MAX_MESSAGES_PER_CHAT, MAX_MESSAGES_PER_CHAT));
    rows.reverse();
    return rows;
  },
});

/**
 * The model's ENTIRE context, server-derived and ownership-checked.
 *
 * /api/chat calls this instead of accepting history in the request body. That
 * is the central design decision of this feature:
 *  - a client cannot inject arbitrary text into an Opus 4.8 call
 *  - the persisted transcript is provably identical to what the model saw
 *  - the cached prefix is deterministic (client-side reordering would silently
 *    kill the message-tier prompt cache)
 */
export const getHistoryForCompletion = query({
  args: { chatId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      messages: v.array(
        v.object({
          role: v.union(v.literal("user"), v.literal("assistant")),
          content: v.string(),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const id = ctx.db.normalizeId("chats", args.chatId);
    if (!id) return null;
    const chat = await ctx.db.get(id);
    if (!chat || chat.userId !== userId) return null;

    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_chat", (q) => q.eq("chatId", id))
      .order("desc")
      .take(HISTORY_MESSAGES);
    rows.reverse();

    // Trim from the OLDEST end so the newest turn always survives, even if it
    // is itself near the per-message cap.
    let budget = HISTORY_CHAR_BUDGET;
    const kept: typeof rows = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      budget -= rows[i]!.content.length;
      if (budget < 0) break;
      kept.push(rows[i]!);
    }
    kept.reverse();
    // Anthropic requires messages[0].role === "user"; a window that starts
    // mid-turn would 400. Also drop any empty error-path rows.
    const cleaned = kept.filter((r) => r.content.trim().length > 0);
    while (cleaned.length > 0 && cleaned[0]!.role === "assistant") {
      cleaned.shift();
    }

    return {
      messages: cleaned.map((r) => ({ role: r.role, content: r.content })),
    };
  },
});
