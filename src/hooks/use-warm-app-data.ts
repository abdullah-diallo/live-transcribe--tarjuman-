"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * Warms the queries the app's tabs need, once, from the shell.
 *
 * Why: every tab used to fetch its own data on mount, so switching Record →
 * History → Settings meant waiting for a fresh Convex round-trip each time and
 * staring at an empty screen. Convex caches an active subscription by
 * (function, args), so holding those subscriptions here means a page that
 * mounts later reads the value straight from the client store and renders
 * populated on its first frame — no loading flash, no refetch.
 *
 * These stay subscribed for the whole session, which is the point: they are
 * small, user-scoped documents, and Convex pushes updates over the socket it
 * already has open rather than polling.
 *
 * THE ARGS BELOW MUST MATCH THE CALL SITES EXACTLY. Convex keys the cache on
 * (function + args), so warming `getRecentSessions` with a different `limit`
 * than the component asks for would populate a different entry and the page
 * would still load from scratch. Current call sites:
 *   - api.sessions.getUserSessions      {}            use-sessions.ts:38
 *   - api.sessions.getRecentSessions    { limit: 3 }  use-sessions.ts:34 (default)
 *   - api.preferences.get               (none → {})   record + settings
 *   - api.subscriptions.getMyUsageThisMonth {}        use-plan.ts:25
 *   - api.subscriptions.getMySubscription (none → {}) settings + plans/manage
 *
 * @param enabled false until Convex Auth has authenticated. These are all
 * auth-required functions, so firing them early would just error — Convex's
 * "skip" sentinel holds them until the user is real.
 */
export function useWarmAppData(enabled: boolean): void {
  const args = enabled ? {} : ("skip" as const);

  // History tab.
  useQuery(api.sessions.getUserSessions, args);
  // "Recent" list on the Record idle screen — `limit` must mirror the hook's
  // default (useRecentSessions(limit = 3)).
  useQuery(
    api.sessions.getRecentSessions,
    enabled ? { limit: 3 } : ("skip" as const)
  );
  // Language pair + main-speaker toggle (Record), and the Settings form.
  useQuery(api.preferences.get, args);
  // Plan usage — drives the record screen's session-limit gate and /plans.
  useQuery(api.subscriptions.getMyUsageThisMonth, args);
  // Subscription status for Settings and /plans/manage.
  useQuery(api.subscriptions.getMySubscription, args);
}
