"use client";

import { AskScreen } from "@/components/ask/ask-screen";

/**
 * Ask Tarjuman — the Islamic AI chat surface.
 *
 * `flex flex-col flex-1` is the house convention every (app) page follows, and
 * (app)/template.tsx's enter animation depends on the page filling its column.
 *
 * The explicit `height: 100dvh` is the part that isn't boilerplate. Every other
 * screen in the app scrolls the DOCUMENT: the layout column is `minHeight:
 * 100dvh`, so it simply grows with its content and the window scrolls. A chat
 * can't work that way — it needs an internal scroll region with the composer
 * pinned beneath it. Without a definite height here, `flex-1` resolves against
 * content rather than the viewport, the thread's `overflow-y-auto` never gets a
 * bound, and the composer is pushed below the fold.
 *
 * Setting it on the page (rather than changing the shared layout to `height`)
 * keeps Record, History and Settings on their existing document-scroll
 * behaviour.
 *
 * NOTE the deliberate absence of `flex-1`, which every other (app) page has.
 * `flex-1` expands to `flex: 1 1 0%`, and in a column flex container a
 * `flex-basis` of 0 OVERRIDES the `height` property — the item is sized by the
 * flex algorithm instead, which resolves against content and re-introduces the
 * exact overflow this height is here to prevent. `flex: 0 1 auto` (the default)
 * is what lets 100dvh actually win.
 */
export default function AskPage() {
  return (
    <div
      className="flex flex-col min-h-0 overflow-hidden"
      style={{ height: "100dvh" }}
    >
      <AskScreen />
    </div>
  );
}
