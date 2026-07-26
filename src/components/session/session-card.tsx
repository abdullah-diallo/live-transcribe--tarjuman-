"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { COLORS } from "@/lib/constants";
import { formatDate, formatDuration, getLangName } from "@/lib/utils";
import { Icon } from "@/components/shared/icon";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PromptDialog } from "@/components/shared/prompt-dialog";
import type { SessionListItem } from "@/hooks/use-sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface SessionCardProps {
  session: SessionListItem;
}

/**
 * Place the options menu as a flyout BESIDE the kebab (to its left, vertically
 * centered on the button) rather than dropping down over the cards below it.
 * Flips to the right only if the left gutter can't fit it; clamps to the
 * viewport so it never spills off-screen.
 */
function sidePlacement(
  r: DOMRect,
  width: number,
  height: number
): React.CSSProperties {
  const gap = 8;
  const margin = 8;
  const left =
    r.left - gap - width >= margin
      ? r.left - gap - width
      : Math.min(r.right + gap, window.innerWidth - width - margin);
  const top = Math.max(
    margin,
    Math.min(r.top + r.height / 2 - height / 2, window.innerHeight - height - margin)
  );
  return { position: "fixed", top, left };
}

export function SessionCard({ session }: SessionCardProps) {
  const updateTitle = useMutation(api.sessions.updateTitle);
  const deleteSession = useMutation(api.sessions.deleteSession);

  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Kept mounted through the exit animation so the flyout glides out instead of
  // vanishing the instant `menuOpen` flips false. Same recipe as account-menu.
  const [menuVisible, setMenuVisible] = useState(false);
  useEffect(() => {
    if (menuOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMenuVisible(true);
      return;
    }
    const t = window.setTimeout(() => setMenuVisible(false), 200);
    return () => window.clearTimeout(t);
  }, [menuOpen]);
  // The popover is positioned `fixed` from the kebab's rect so it escapes the
  // card's `overflow-hidden` and the scrolling list (an absolute menu clips).
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
  const kebabRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // The kebab's rect at open time — used to recompute placement once the menu
  // has mounted and its real size is known.
  const anchorRef = useRef<DOMRect | null>(null);

  const title = session.title ?? "Untitled session";
  const hasSummary = Boolean(session.summary);

  // Close the menu on any scroll / resize / Escape so it can't drift from its
  // anchor (it's fixed-positioned, not tied to the button after open).
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = kebabRef.current;
    if (btn) {
      const r = btn.getBoundingClientRect();
      anchorRef.current = r;
      // Provisional side placement using the menu's known size (w-44 = 176px,
      // ~92px tall for two items). Refined after mount by the layout effect
      // below — the estimate avoids an opening flicker.
      setMenuStyle(sidePlacement(r, 176, 92));
    }
    setMenuOpen(true);
  };

  // Once the menu is in the DOM, measure it and re-place it precisely so the
  // flyout is vertically centered on the kebab regardless of item heights.
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const menu = menuRef.current;
    const r = anchorRef.current;
    if (!menu || !r) return;
    const rect = menu.getBoundingClientRect();
    setMenuStyle(sidePlacement(r, rect.width, rect.height));
  }, [menuOpen]);

  const onRename = () => {
    setMenuOpen(false);
    setRenameOpen(true);
  };

  const onDelete = () => {
    setMenuOpen(false);
    setDeleteOpen(true);
  };

  const handleRenameSave = async (next: string) => {
    if (next === session.title) return;
    await updateTitle({
      sessionId: session._id as Id<"sessions">,
      title: next,
    });
  };

  const handleDeleteConfirm = async () => {
    await deleteSession({ sessionId: session._id as Id<"sessions"> });
  };

  return (
    // Border/background are CLASSES, not inline styles: an inline declaration
    // beats a Tailwind `hover:` rule, so while they lived in `style` no hover
    // border or glow could ever apply. `data-hovercard` lets AutoHoverGrid
    // replay the same lift+glow on touch, where there is no pointer to hover.
    <div
      data-hovercard
      className="group w-full flex items-stretch rounded-[20px] mb-[10px] overflow-hidden border border-[var(--color-border-faint)] bg-[var(--color-surface)] transition duration-200 ease-out will-change-transform hover:-translate-y-1.5 hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-light)] hover:shadow-[0_14px_36px_rgba(var(--color-accent-rgb),0.2)]"
    >
      <Link
        href={`/session/${session._id}`}
        className="flex-1 flex items-start gap-3 px-5 py-4 min-w-0 cursor-pointer transition-colors"
      >
        <div
          className="w-10 h-10 rounded-2xl grid place-items-center flex-shrink-0 mt-[2px]"
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

      <div className="flex items-center pr-2 flex-shrink-0">
        <button
          ref={kebabRef}
          type="button"
          onClick={openMenu}
          aria-label="Session options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="w-9 h-9 rounded-lg grid place-items-center transition-colors hover:bg-white/5"
          style={{ color: menuOpen ? COLORS.w : COLORS.t3 }}
        >
          <Icon name="more" size={18} color="currentColor" />
        </button>
      </div>

      {(menuOpen || menuVisible) && menuStyle && (
        <>
          <div
            className={`fixed inset-0 z-40 transition-opacity duration-200 ${
              menuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            onClick={() => setMenuOpen(false)}
          />
          <div
            ref={menuRef}
            role="menu"
            className={`z-50 w-44 rounded-xl overflow-hidden origin-top transition-[opacity,transform] duration-200 ease-out ${
              menuOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-1"
            }`}
            style={{
              ...menuStyle,
              background: COLORS.surface,
              border: `1px solid ${COLORS.borderLight}`,
              boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={onRename}
              className="w-full px-4 py-3 flex items-center gap-2 text-left text-[13px] font-semibold cursor-pointer hover:bg-black/20 transition-colors"
              style={{ color: COLORS.t2 }}
            >
              <Icon name="edit" size={15} color={COLORS.t3} />
              Rename
            </button>
            <div style={{ borderTop: `1px solid ${COLORS.border}` }} />
            <button
              type="button"
              role="menuitem"
              onClick={onDelete}
              className="w-full px-4 py-3 flex items-center gap-2 text-left text-[13px] font-semibold cursor-pointer hover:bg-red-500/10 transition-colors"
              style={{ color: COLORS.red }}
            >
              <Icon name="trash" size={15} color={COLORS.red} />
              Delete
            </button>
          </div>
        </>
      )}

      <PromptDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename session"
        label="Session name"
        placeholder="e.g. Friday khutbah, March 14"
        defaultValue={session.title ?? ""}
        onSave={handleRenameSave}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this session?"
        message="The transcript and summary will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
