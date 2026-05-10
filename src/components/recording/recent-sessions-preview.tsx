"use client";

import Link from "next/link";
import { COLORS } from "@/lib/constants";
import { formatDate, formatDuration, getLangName } from "@/lib/utils";
import { Icon } from "@/components/shared/icon";
import { useRecentSessions } from "@/hooks/use-sessions";

export function RecentSessionsPreview() {
  const sessions = useRecentSessions(3);

  // Loading (server / pre-hydration): render nothing — this preview is
  // optional, keep the idle screen quiet.
  if (sessions === undefined) return null;

  // Empty: don't show the section header at all on a fresh install.
  if (sessions.length === 0) return null;

  return (
    <div>
      <div
        className="text-xs font-semibold tracking-[1px] uppercase mb-[10px]"
        style={{ color: COLORS.t4 }}
      >
        Recent
      </div>
      {sessions.map((s) => {
        const title = s.title ?? "Untitled session";
        return (
          <Link
            key={s._id}
            href={`/session/${s._id}`}
            className="w-full flex items-center gap-3 px-[14px] py-3 rounded-[10px] mb-1.5 cursor-pointer transition-colors"
            style={{ background: COLORS.surface }}
          >
            <Icon name="doc" size={18} color={COLORS.t4} />
            <div className="flex-1 min-w-0">
              <div
                className="text-[13px] font-semibold truncate"
                style={{ color: COLORS.t2 }}
              >
                {title}
              </div>
              <div className="text-[11px]" style={{ color: COLORS.t4 }}>
                {getLangName(s.sourceLanguage)} →{" "}
                {getLangName(s.targetLanguage)} · {formatDate(s.createdAt)}
              </div>
            </div>
            <span
              className="text-xs tabular-nums"
              style={{ color: COLORS.t4 }}
            >
              {formatDuration(s.duration)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
