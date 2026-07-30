import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";

/**
 * The authenticated user's id, or throw.
 *
 * Fail-closed on a deleted identity: a still-valid JWT whose `users` row is
 * gone must NOT be allowed to write orphan rows. (This is identity, not
 * off-language — closing is correct here.) One extra read on the write path.
 *
 * Lives here rather than in sessions.ts because it is a security invariant
 * shared by sessions and chats; two copies would drift.
 */
export async function requireUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await auth.getUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Account no longer exists");
  return userId;
}
