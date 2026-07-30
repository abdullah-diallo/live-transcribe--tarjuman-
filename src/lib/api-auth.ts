import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Server-side helpers for the Next.js API routes.
 *
 * Why this exists: routes like /api/translate and /api/summarize call paid
 * upstream APIs (Anthropic). On localhost they were unauthenticated which
 * is fine, but as soon as the app is deployed publicly anyone who finds
 * those URLs can curl them in a loop and burn the budget.
 *
 * Two protections:
 *  1. requireAuthFromHeader — verifies a Bearer token issued by Convex Auth.
 *     Returns the userId on success, null on failure (caller returns 401).
 *  2. checkRateLimit — in-memory token-bucket per (userId, kind) pair.
 *     Single-process scope (we run on a single Node server, no edge fan-out),
 *     which is sufficient for MVP. If we ever scale to multiple replicas
 *     this becomes per-replica rather than global; tighten by ~half then.
 */

interface AuthOk {
  userId: Id<"users">;
}

const cachedClient = (() => {
  let c: ConvexHttpClient | null = null;
  return () => {
    if (!c) {
      const url = process.env.NEXT_PUBLIC_CONVEX_URL;
      if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
      c = new ConvexHttpClient(url);
    }
    return c;
  };
})();

export async function requireAuthFromHeader(
  req: Request
): Promise<AuthOk | null> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  // Use a fresh client per request — ConvexHttpClient.setAuth mutates state,
  // so concurrent requests on the same client could race. Cheap to create.
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  const client = new ConvexHttpClient(url);
  client.setAuth(token);

  try {
    const me = await client.query(api.users.me, {});
    if (!me) return null;
    return { userId: me._id };
  } catch {
    // Invalid / expired token, malformed, etc. Treat as unauthenticated.
    return null;
  }
}

// Touch the cached client to keep TS from removing it as unused — it's the
// fallback the future may want to switch back to once we trust no concurrent
// auth-per-request mutations.
void cachedClient;

/**
 * Fetch the caller's this-month plan usage, for the cost gates on
 * /api/deepgram (sessions) and /api/summarize (summaries). Returns null on any
 * failure (no bearer token, invalid token, query error) — callers FAIL OPEN:
 * a transient Convex hiccup must never lock a paying-or-free user out of the
 * app. The product gate is the reactive UI; this is the can't-bypass-the-UI
 * backstop.
 */
export async function getUsageFromHeader(
  req: Request
): Promise<{
  plan: "free" | "pro";
  sessionsUsed: number;
  summariesUsed: number;
  sessionsLimit: number | null;
  summariesLimit: number | null;
  canStartSession: boolean;
  canSummarize: boolean;
} | null> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  try {
    return await client.query(api.subscriptions.getMyUsageThisMonth, {});
  } catch {
    return null;
  }
}

export type ChatHistoryResult =
  | { ok: true; messages: { role: "user" | "assistant"; content: string }[] }
  | { ok: false; reason: "not_found" | "unavailable" };

/**
 * The caller's chat history, model-shaped and already capped by Convex.
 *
 * /api/chat calls this instead of accepting message history in the request
 * body: a client that could supply `messages[]` could inject arbitrary text
 * into a Claude Opus 4.8 call, and the persisted transcript could drift from
 * what the model actually saw. Ownership is enforced inside Convex against the
 * caller's own token, so no cross-user read is expressible here.
 *
 * FAILS CLOSED, unlike getUsageFromHeader above. That helper is a cost gate,
 * where a transient Convex hiccup must never lock a user out. This one is the
 * model's ENTIRE context: answering "so is that permissible?" with no
 * antecedent produces a confidently wrong religious answer. A 503 the user can
 * retry beats a plausible answer to the wrong question.
 */
export async function getChatHistoryFromHeader(
  req: Request,
  chatId: string
): Promise<ChatHistoryResult> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return { ok: false, reason: "unavailable" };
  }
  const token = header.slice(7).trim();
  if (!token) return { ok: false, reason: "unavailable" };
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return { ok: false, reason: "unavailable" };
  // Fresh client per request: setAuth mutates client state, so a shared
  // instance races across concurrent requests.
  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  try {
    const res = await client.query(api.chats.getHistoryForCompletion, {
      chatId,
    });
    // null means "no such chat, or not yours" — indistinguishable by design.
    if (!res) return { ok: false, reason: "not_found" };
    return { ok: true, messages: res.messages };
  } catch (e) {
    console.error(
      `[chat] history lookup failed: ${e instanceof Error ? e.message : String(e)}`
    );
    return { ok: false, reason: "unavailable" };
  }
}

// ─── Rate limiter (token bucket per user, per action) ──────────────────────

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

interface LimitConfig {
  capacity: number;
  refillPerSec: number;
}

const buckets = new Map<string, Bucket>();

const LIMITS: Record<string, LimitConfig> = {
  // Translation runs once per finalized transcript segment. A typical
  // 30-min khutbah produces ~50 finals, ≈1.7/min average, with bursts up
  // to ~6/min during fast speech. Cap at 60/min absorbs reasonable bursts;
  // a malicious loop hits the cap immediately.
  translate: { capacity: 60, refillPerSec: 1 },
  // Summary is once per session. A user shouldn't need more than ~10/hour
  // even with re-generations.
  summarize: { capacity: 10, refillPerSec: 10 / 3600 },
  // Deepgram token mint fires once per session (+ on reconnect). Same
  // generous bucket as translate.
  transcribe: { capacity: 60, refillPerSec: 1 },
  // Pro AI tools — one-shot per session, like summarize.
  studynotes: { capacity: 10, refillPerSec: 10 / 3600 },
  translatetranscript: { capacity: 10, refillPerSec: 10 / 3600 },
  // Ask-the-lecture is interactive; allow a real back-and-forth (~40/hour).
  ask: { capacity: 40, refillPerSec: 40 / 3600 },
  // Ask Tarjuman (Islamic AI chat). Interactive, but every message is a Claude
  // Opus 4.8 call with adaptive thinking — roughly 10-25x the marginal cost of
  // a translate segment. A genuine Q&A session runs 5-15 messages, so a
  // 20-message burst never walls a real user, while 30/hour sustained caps a
  // scripted loop. Note this bucket is in-memory and resets on deploy; the
  // durable ceiling is the monthly fuse in convex/chats.ts.
  chat: { capacity: 20, refillPerSec: 30 / 3600 },
};

export function checkRateLimit(
  userId: string,
  kind: keyof typeof LIMITS
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const cfg = LIMITS[kind];
  const key = `${userId}:${kind}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: cfg.capacity, lastRefillMs: now };
    buckets.set(key, bucket);
  }

  const elapsedSec = (now - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(
    cfg.capacity,
    bucket.tokens + elapsedSec * cfg.refillPerSec
  );
  bucket.lastRefillMs = now;

  if (bucket.tokens < 1) {
    const tokensNeeded = 1 - bucket.tokens;
    const retryAfterSec = Math.ceil(tokensNeeded / cfg.refillPerSec);
    return { allowed: false, retryAfterSec };
  }
  bucket.tokens -= 1;
  return { allowed: true };
}

// ─── Periodic GC ───────────────────────────────────────────────────────────
// In-memory map grows unbounded over the life of the server. GC stale buckets
// every 10 minutes — anything that hasn't been touched in 60 minutes is dropped.
if (typeof setInterval !== "undefined") {
  setInterval(
    () => {
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const [key, bucket] of buckets) {
        if (bucket.lastRefillMs < cutoff) buckets.delete(key);
      }
    },
    10 * 60 * 1000
  );
}
