"use client";

import { useEffect } from "react";
import { COLORS } from "@/lib/constants";
import { Icon } from "@/components/shared/icon";
import { Sentry } from "@/lib/sentry";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Dev console + Sentry. Sentry no-ops when DSN isn't configured.
    console.error("App error boundary caught:", error);
    Sentry.captureException(error, {
      tags: { boundary: "app-route" },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <div
      className="flex flex-col items-center justify-center px-8 text-center gap-5"
      style={{ minHeight: "100dvh", paddingBottom: 60 }}
    >
      <div
        className="w-16 h-16 rounded-2xl grid place-items-center"
        style={{
          background: COLORS.redSoft,
          border: `1px solid ${COLORS.red}30`,
        }}
      >
        <Icon name="close" size={28} color={COLORS.red} />
      </div>
      <div>
        <div
          className="text-lg font-bold mb-2"
          style={{ color: COLORS.w }}
        >
          Something went wrong
        </div>
        <div
          className="text-sm leading-relaxed"
          style={{ color: COLORS.t2 }}
        >
          {error.message || "An unexpected error occurred."}
        </div>
        {error.digest && (
          <div
            className="text-[11px] mt-2 font-mono"
            style={{ color: COLORS.t4 }}
          >
            ref: {error.digest}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={reset}
        className="mt-2 px-5 py-3 rounded-xl font-bold text-sm transition-transform active:scale-95"
        style={{
          background: COLORS.accent,
          color: "#0A0F1C",
          boxShadow: `0 0 24px ${COLORS.accent}35`,
        }}
      >
        Try again
      </button>
    </div>
  );
}
