"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

/**
 * Convex-backed sessions hooks.
 *
 * Each `useQuery` call here is reactive — Convex pushes updates over its
 * WebSocket whenever the underlying table changes, so a mutation in one
 * tab/component re-renders everything that subscribes via these hooks.
 *
 * Return values:
 *   - `undefined` while the query is loading (first render or unauthenticated
 *     waiting for the WS to attach)
 *   - `null` for `useSession` if the id doesn't resolve
 *   - the document(s) once loaded
 *
 * This is the same loading model the previous localStorage-backed
 * implementation used, so call-sites don't need to change shape.
 */

export type StoredSession = Doc<"sessions">;

export function useRecentSessions(limit = 3): StoredSession[] | undefined {
  return useQuery(api.sessions.getRecentSessions, { limit });
}

export function useAllSessions(): StoredSession[] | undefined {
  return useQuery(api.sessions.getUserSessions, {});
}

export function useSession(
  sessionId: string | null
): StoredSession | null | undefined {
  // Pass `"skip"` when there's no id — Convex won't subscribe and the hook
  // returns undefined, which the page treats as "loading."
  return useQuery(
    api.sessions.getSession,
    sessionId ? { sessionId: sessionId as Doc<"sessions">["_id"] } : "skip"
  );
}
