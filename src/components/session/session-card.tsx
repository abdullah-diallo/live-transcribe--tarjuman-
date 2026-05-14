"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { COLORS } from "@/lib/constants";
import { formatDate, formatDuration, getLangName } from "@/lib/utils";
import { Icon } from "@/components/shared/icon";
import type { StoredSession } from "@/hooks/use-sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface SessionCardProps {
  session: StoredSession;
}

export function SessionCard({ session }: SessionCardProps) {
  const updateTitle = useMutation(api.sessions.updateTitle);
  const deleteSession = useMutation(api.sessions.deleteSession);

  const [hoverRename, setHoverRename] = useState(false);
  const [hoverDelete, setHoverDelete] = useState(false);

  const title = session.title ?? "Untitled session";
  const hasSummary = Boolean(session.summary);

  const handleRename = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = window.prompt("Rename session", session.title ?? "");
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === session.title) return;
    void updateTitle({
      sessionId: session._id as Id<"sessions">,
      title: trimmed,
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(
      "Delete this session? The transcript and summary will be permanently removed."
    );
    if (!ok) return;
    void deleteSession({ sessionId: session._id as Id<"sessions"> });
  };

  return (
    <div
      className="w-full flex items-stretch rounded-xl mb-2 overflow-hidden"
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <Link
        href={`/session/${session._id}`}
        className="flex-1 flex items-start gap-3 px-4 py-3 min-w-0 cursor-pointer transition-colors"
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

      <div className="flex items-center gap-0.5 pr-2 flex-shrink-0">
        <button
          type="button"
          onClick={handleRename}
          onMouseEnter={() => setHoverRename(true)}
          onMouseLeave={() => setHoverRename(false)}
          aria-label="Rename session"
          className="w-9 h-9 rounded-lg grid place-items-center transition-colors"
          style={{
            background: hoverRename ? COLORS.surfaceLight : "transparent",
            color: hoverRename ? COLORS.w : COLORS.t3,
          }}
        >
          <Icon name="edit" size={16} color="currentColor" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          onMouseEnter={() => setHoverDelete(true)}
          onMouseLeave={() => setHoverDelete(false)}
          aria-label="Delete session"
          className="w-9 h-9 rounded-lg grid place-items-center transition-colors"
          style={{
            background: hoverDelete ? COLORS.redSoft : "transparent",
            color: hoverDelete ? COLORS.red : COLORS.t3,
          }}
        >
          <Icon name="trash" size={16} color="currentColor" />
        </button>
      </div>
    </div>
  );
}
