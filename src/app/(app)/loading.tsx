/**
 * Route-transition fallback for the signed-in tabs.
 *
 * Without a loading boundary, moving between Record / History / Settings shows
 * the previous screen frozen until the next route's chunk resolves, which is
 * what "these pages take too long to load" feels like. This paints instantly
 * instead.
 *
 * Deliberately a quiet skeleton rather than a spinner: it mirrors the shape of
 * the list screens (a header line plus a few cards), so the layout doesn't jump
 * when the real content swaps in. Colours come from the palette variables, so
 * it follows whichever theme is active.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col flex-1 px-5 py-4" aria-busy="true">
      <span className="sr-only">Loading…</span>

      {/* Header line */}
      <div className="h-5 w-32 rounded-md bg-[var(--color-surface-light)] animate-pulse" />

      {/* Card placeholders — same rhythm as the history / recent lists. */}
      <div className="mt-5 flex flex-col gap-[10px]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[76px] rounded-[20px] border border-[var(--color-border-faint)] bg-[var(--color-surface)] animate-pulse"
            // Staggered so the three don't pulse in lockstep, which reads as a
            // flash rather than as loading.
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
