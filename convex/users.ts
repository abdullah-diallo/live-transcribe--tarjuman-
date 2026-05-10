import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

/**
 * Returns the currently signed-in user's profile, or null if signed-out.
 * The client uses this to render the user's name/avatar in the nav and to
 * decide whether to render the auth-guarded app shell.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      image: user.image,
    };
  },
});

/**
 * Deletes the signed-in user's account and all their session data.
 *
 * GDPR Art. 17 (right to erasure) requires this. Cascade-deletes:
 *  - Every row in `sessions` owned by this user
 *  - The Convex Auth identity rows (auth tokens, account links, etc. —
 *    Convex Auth's `authTables` includes these; we delete the user row
 *    and Convex Auth's internal cleanup handles credential rows on
 *    next login attempt; for absolute cleanup the user can also email
 *    support to wipe orphaned auth rows).
 *  - The user row itself.
 *
 * This mutation is final — there is no soft-delete or undo.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Delete every session belonging to this user.
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    // Delete account-link rows so the email/Google identity can be re-used
    // on a fresh signup. authTables's `authAccounts` is keyed by the user.
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const acc of accounts) {
      await ctx.db.delete(acc._id);
    }

    // Sessions table from authTables (auth sessions, not transcript sessions).
    const authSessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const s of authSessions) {
      await ctx.db.delete(s._id);
    }

    await ctx.db.delete(userId);
  },
});
