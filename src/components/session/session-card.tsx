"use client";

import Link from "next/link";
import { COLORS } from "@/lib/constants";
import { formatDate, formatDuration, getLangName } from "@/lib/utils";
import { Icon } from "@/components/shared/icon";
import type { StoredSession } from "@/hooks/use-sessions";

interface SessionCardProps {
  session: StoredSession;
}

export function SessionCard({ session }: SessionCardProps) {
  const title = session.title ?? "Untitled session";
  const hasSummary = Boolean(session.summary);

  return (
    <Link
      href={`/session/${session._id}`}
      className="w-full flex items-start gap-3 px-4 py-3 rounded-xl mb-2 cursor-pointer transition-colors"
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <div
        className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 mt-[2px]"
        style={{
          background: COLORS.surfaceLight,
          border: `1px solid ${COLORS.borderLight}`,
        }}
      >
        <Icon name="doc" size={16} color={COLORS.t3} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div
            className="text-[14px] font-semibold truncate"
            style={{ color: COLORS.w }}
          >
            {title}
          </div>
          {hasSummary && (
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-[6px] py-[2px] rounded-md flex-shrink-0"
              style={{
                background: COLORS.accentSoft,
                color: COLORS.accent,
              }}
            >
              ✦ Summary
            </span>
          )}
        </div>
        <div
          className="text-[11px] flex items-center gap-2"
          style={{ color: COLORS.t4 }}
        >
          <span>{getLangName(session.sourceLanguage)}</span>
          <span>→</span>
          <span>{getLangName(session.targetLanguage)}</span>
          <span>·</span>
          <span>{formatDate(session.createdAt)}</span>
          <span>·</span>
          <span className="tabular-nums">
            {formatDuration(session.duration)}
          </span>
        </div>
      </div>
    </Link>
  );
}
