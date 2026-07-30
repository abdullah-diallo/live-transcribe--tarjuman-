import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * Schema notes:
 * - `authTables` (from @convex-dev/auth) provides the `users` table plus the
 *   internal credential / session / verification tables Convex Auth needs.
 *   The `users` table comes with: name, email, image, phone, emailVerificationTime,
 *   etc. — all optional. We don't need to extend it.
 * - `sessions.userId` was optional during Phase B (anonymous mode). Now that
 *   auth is wired, we keep it optional in the schema (so any Phase B test
 *   rows still validate) but the mutations always set it from the
 *   authenticated user.
 */
export default defineSchema({
  ...authTables,

  sessions: defineTable({
    userId: v.optional(v.id("users")),
    title: v.optional(v.string()),
    sourceLanguage: v.string(),
    targetLanguage: v.string(),
    status: v.union(
      v.literal("recording"),
      v.literal("paused"),
      v.literal("completed")
    ),
    // LEGACY inline transcript. Kept for sessions recorded before segments
    // moved to the dedicated `transcriptSegments` table (below). New sessions
    // leave this as [] and store segments as table rows — an inline array grows
    // unbounded and a 2-3h dars would cross Convex's 1 MiB per-document cap,
    // after which every 5s save throws and the transcript silently stops
    // persisting mid-lecture. Reads fall back to this array when the table has
    // no rows for a session, so old sessions render unchanged with no backfill.
    segments: v.array(
      v.object({
        id: v.string(),
        sourceText: v.string(),
        translatedText: v.string(),
        timestamp: v.number(),
        // Verse/hadith continuation merge. When the LLM recognizes that
        // this segment, combined with prior context, completes a known
        // Quran verse or authentic hadith, the parent segment carries:
        //   - mergedFromIds: ids of consecutive earlier segments to absorb
        //   - combinedSourceText: the full source (e.g., Arabic verse)
        //   - combinedTranslatedText: the full translation with citation
        // Readers build a suppressed set from `mergedFromIds` to hide the
        // child segments and render only the parent's combined text.
        mergedFromIds: v.optional(v.array(v.string())),
        combinedSourceText: v.optional(v.string()),
        combinedTranslatedText: v.optional(v.string()),
      })
    ),
    // Number of transcript segments stored (in the table, or legacy inline).
    // Lets list/sweep/title logic tell a real session from an empty phantom
    // WITHOUT loading the (potentially huge) segment set. Optional: undefined
    // on legacy rows, where readers fall back to segments.length.
    segmentCount: v.optional(v.number()),
    // First segment's text (translation or source), captured on first insert,
    // so completeSession/sweep can derive a title without loading segments.
    firstSegmentText: v.optional(v.string()),
    duration: v.number(),
    summary: v.optional(v.string()),
    summaryLanguage: v.optional(v.string()),
    // When the AI summary was generated (ms). Drives the per-month summary
    // quota (see convex/billingLimits.ts). Optional: pre-existing summaries
    // predate this field and simply don't count toward the current month.
    summaryGeneratedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "createdAt"])
    // Drives the stale-session cron sweep (status="recording" + updatedAt<cutoff)
    // without a full-table scan. Replaced the unused by_date index.
    .index("by_status_updated", ["status", "updatedAt"]),

  // Transcript segments, one row per segment. Segments used to live inline on
  // the session document, but an inline array grows without bound: a 2-3h dars
  // reaches thousands of segments and crosses Convex's 1 MiB per-document write
  // cap, after which the 5s batch save throws and — because each later batch
  // re-sends an even larger array — ALL further saves fail silently while the
  // tab keeps rendering. Storing each segment as its own row makes every write
  // O(1) with no document-size ceiling. Ordered by insertion (_creationTime)
  // via by_session; by_session_seg gives O(1) dedupe by client segment id.
  transcriptSegments: defineTable({
    sessionId: v.id("sessions"),
    segId: v.string(), // client-generated segment id (stable, used for dedupe)
    sourceText: v.string(),
    translatedText: v.string(),
    timestamp: v.number(),
    mergedFromIds: v.optional(v.array(v.string())),
    combinedSourceText: v.optional(v.string()),
    combinedTranslatedText: v.optional(v.string()),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_seg", ["sessionId", "segId"]),

  // ─── Ask Tarjuman: Islamic AI chat ──────────────────────────────────────
  //
  // One row per conversation, METADATA ONLY — messages live in the
  // `chatMessages` child table below, for exactly the reason
  // `transcriptSegments` exists. A conversation is unbounded: an inline array
  // rewrites the whole document on every send and a long chat eventually
  // crosses Convex's 1 MiB per-document cap, after which every append throws
  // and the chat silently stops persisting mid-conversation.
  //
  // messageCount / firstMessageText / lastMessagePreview are denormalized so a
  // chat list renders without reading chatMessages at all (same pattern, same
  // rationale, as sessions.segmentCount / sessions.firstSegmentText).
  //
  // There is deliberately NO `createChat` mutation — a chat is created lazily
  // by the first appendUserMessage. That structurally eliminates the empty
  // phantom-row problem `sessions` still carries (createSession-on-prewarm,
  // then filtered out everywhere by `segmentCount > 0`).
  chats: defineTable({
    userId: v.id("users"),
    // Derived from the first user message; user-editable via renameChat.
    title: v.optional(v.string()),
    firstMessageText: v.optional(v.string()),
    // Newest message, truncated at write time. Truncated deliberately: an
    // untruncated 4000-char message would bloat every list query's read set.
    lastMessagePreview: v.optional(v.string()),
    messageCount: v.number(),
    // Bumped on every append — drives the recency-ordered chat list.
    lastMessageAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_recent", ["userId", "lastMessageAt"]),

  chatMessages: defineTable({
    chatId: v.id("chats"),
    // Denormalized from the parent. Two load-bearing reasons:
    //  1. The per-user monthly message fuse needs an indexed (user, time) range
    //     read. Counting via chats would be O(chats) reads per gate check on
    //     every single message.
    //  2. users.deleteAccount can drain a user's messages directly instead of
    //     fanning out one query per chat (GDPR erasure at O(messages)).
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    // Client-generated, stable per send. Dedupes a double-tapped Send or a
    // retried persist — same role as transcriptSegments.segId.
    clientId: v.string(),
    // Assistant-only bookkeeping.
    model: v.optional(v.string()),
    finish: v.optional(
      v.union(v.literal("ok"), v.literal("truncated"), v.literal("error"))
    ),
    // Citations resolved by the server-side sunnah.com / quran.com pass, so the
    // UI renders a sources strip without re-parsing the markdown.
    citations: v.optional(
      v.array(
        v.object({
          source: v.union(v.literal("sunnah"), v.literal("quran")),
          label: v.string(),
          url: v.string(),
          verified: v.boolean(),
        })
      )
    ),
    createdAt: v.number(),
  })
    .index("by_chat", ["chatId"])
    .index("by_chat_client", ["chatId", "clientId"])
    .index("by_user_created", ["userId", "createdAt"]),

  // Per-user app preferences. One row per user (upserted). All fields optional
  // so the row can be created lazily and new prefs can be added without a
  // migration. Backed by Convex (not localStorage) so settings sync across
  // devices and the planned native apps.
  userPreferences: defineTable({
    userId: v.id("users"),
    defaultSourceLanguage: v.optional(v.string()),
    defaultTargetLanguage: v.optional(v.string()),
    ttsEnabled: v.optional(v.boolean()),
    mainSpeakerOnly: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  // Stripe billing state — one row per paying user (kept separate from `users`
  // to avoid write contention between profile edits and webhook-driven billing
  // updates). The row is created when the user first hits Checkout (so we have
  // a place to stash `stripeCustomerId`), then the Stripe webhook patches
  // `plan`/`status`/period as the subscription lifecycle progresses.
  //
  // NOTE (test-mode experiment): `plan` is always DERIVED from `status`
  // (active/trialing → "pro", else "free") so re-delivered or out-of-order
  // webhooks are idempotent — see convex/subscriptions.ts:upsertFromStripe.
  subscriptions: defineTable({
    userId: v.id("users"),
    stripeCustomerId: v.string(),
    subscriptionId: v.optional(v.string()),
    priceId: v.optional(v.string()),
    plan: v.union(v.literal("free"), v.literal("pro")),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete")
    ),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_customer", ["stripeCustomerId"]),
});
