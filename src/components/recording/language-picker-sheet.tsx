"use client";

import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useEffect, useRef, useState } from "react";
import { LANGUAGES } from "@/lib/constants";
import { COLORS } from "@/lib/constants";
import { Icon } from "@/components/shared/icon";

interface LanguagePickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "source" | "target";
  selected: string;
  onSelect: (code: string) => void;
}

// Strip diacritics so searching "francais" matches "Français", etc.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function LanguagePickerSheet({
  open,
  onOpenChange,
  type,
  selected,
  onSelect,
}: LanguagePickerSheetProps) {
  const [query, setQuery] = useState("");
  // The list is filtered as you type; glide the rows instead of snapping.
  const [listRef] = useAutoAnimate<HTMLDivElement>({
    duration: 200,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  // When the sheet opens, clear stale search text and focus the input
  // after the open animation. Deferring the setQuery into the same timeout
  // as the focus avoids the cascading-render that comes from setting state
  // synchronously in an effect body.
  //
  // AUTOFOCUS IS DESKTOP-ONLY. As a bottom drawer, focusing the input on a
  // phone raises the software keyboard, and vaul's `repositionInputs` then
  // translates the whole sheet up to clear it — which on a ~300px iOS keyboard
  // collapses the language list to nothing. There are only ~30 languages; on a
  // phone people scroll, they don't type. Skipping the focus on touch sidesteps
  // that entire class of problem rather than fighting it with heights.
  useEffect(() => {
    if (!open) return;
    const coarse =
      typeof window !== "undefined" &&
      window.matchMedia?.("(hover: none)").matches;
    const t = setTimeout(() => {
      setQuery("");
      if (!coarse) inputRef.current?.focus();
    }, 150);
    return () => clearTimeout(t);
  }, [open]);

  const q = normalize(query.trim());
  const filtered = q
    ? LANGUAGES.filter((lang) => {
        return (
          normalize(lang.name).includes(q) ||
          normalize(lang.native).includes(q) ||
          lang.code.toLowerCase().includes(q)
        );
      })
    : LANGUAGES;

  return (
    // A bottom DRAWER rather than a centered dialog: drag-to-dismiss with
    // velocity is the right gesture for a long list opened one-handed, and it
    // is the gesture people already expect from a sheet. Vaul wraps Radix's
    // Dialog primitives, so the focus trap, aria-modal, Esc and onOpenChange
    // contract are unchanged. Overlay + glass material live in ui/drawer.tsx.
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="pt-2 pb-3 outline-none">
          {/* Header */}
          <div
            className="px-6 pt-3 pb-4"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            <DrawerTitle
              className="text-base font-bold"
              style={{ color: COLORS.w }}
            >
              {type === "source" ? "Source Language" : "Target Language"}
            </DrawerTitle>
            <DrawerDescription
              className="text-[13px] mt-0.5"
              style={{ color: COLORS.t3 }}
            >
              {type === "source"
                ? "Language being spoken"
                : "Language you want to read"}
            </DrawerDescription>
          </div>

          {/* Search bar */}
          {/* data-vaul-no-drag: a fumbled swipe starting on the input must
              not begin a dismiss drag. */}
          <div className="px-3 pt-3 pb-2" data-vaul-no-drag>
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-[10px]"
              style={{
                // Translucent so it reads as part of the glass material, not
                // an opaque patch (matches the prompt-dialog input).
                background: "rgba(10, 16, 30, 0.7)",
                border: `1px solid ${COLORS.borderLight}`,
              }}
            >
              <Icon name="search" size={16} color={COLORS.t3} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search languages..."
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: COLORS.w }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="p-0.5 rounded hover:opacity-70 cursor-pointer"
                  aria-label="Clear search"
                >
                  <Icon name="close" size={14} color={COLORS.t3} />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable language list */}
          <div ref={listRef} className="flex-1 overflow-auto p-2 px-3">
            {filtered.length === 0 ? (
              <div
                className="text-center py-8 text-sm"
                style={{ color: COLORS.t3 }}
              >
                No languages found
              </div>
            ) : (
              filtered.map((lang) => {
                const isSelected = selected === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      onSelect(lang.code);
                      onOpenChange(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-[14px] rounded-[10px] border-0 cursor-pointer transition-colors"
                    style={{
                      background: isSelected
                        ? COLORS.accentSoft
                        : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected)
                        e.currentTarget.style.background = COLORS.surfaceLight;
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-sm font-semibold"
                        style={{
                          color: isSelected ? COLORS.accent : COLORS.w,
                        }}
                      >
                        {lang.name}
                      </span>
                      <span
                        className="text-[13px]"
                        style={{ color: COLORS.t3 }}
                        dir={lang.rtl ? "rtl" : "ltr"}
                      >
                        {lang.native}
                      </span>
                    </div>
                    {isSelected && (
                      <div
                        className="w-5 h-5 rounded-full grid place-items-center"
                        style={{ background: COLORS.accent }}
                      >
                        <Icon name="check" size={12} color="#fff" />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
      </DrawerContent>
    </Drawer>
  );
}