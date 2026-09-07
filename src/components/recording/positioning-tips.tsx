"use client";

import { useEffect, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { COLORS } from "@/lib/constants";
import { useLocale } from "@/lib/i18n/locale-context";
import { Icon } from "@/components/shared/icon";

const ACK_KEY = "livetranscribe:positioning-tips-ack";

interface PositioningTipsProps {
  /**
   * Force the tips open even after they've been acknowledged. Used when the
   * user explicitly taps a "How to record" button later.
   */
  forceOpen?: boolean;
  onClose?: () => void;
}

/**
 * Onboarding overlay shown before the first recording. The masjid use case
 * (phone capturing PA-speaker audio in a reverberant room) lives or dies by
 * mic positioning, so we want every first-time user to see this advice once.
 *
 * Acknowledgement is tracked in localStorage. The user can re-open the tips
 * from the idle screen via the tips button.
 */
export function PositioningTips({
  forceOpen = false,
  onClose,
}: PositioningTipsProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(ACK_KEY)) {
      setOpen(true);
    }
  }, [forceOpen]);

  const handleClose = (next: boolean) => {
    if (!next) {
      try {
        localStorage.setItem(ACK_KEY, "1");
      } catch {
        /* private mode */
      }
      onClose?.();
    }
    setOpen(next);
  };

  return (
    // A bottom DRAWER rather than a centered dialog: this is read-and-dismiss
    // onboarding with no inputs and no destructive action, so swipe-to-dismiss
    // is exactly the right gesture. Vaul wraps Radix's Dialog primitives, so
    // focus trap / aria-modal / Esc / onOpenChange are unchanged. Overlay and
    // the glass material live in ui/drawer.tsx.
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent className="overflow-auto pb-2 outline-none">
          <div className="px-6 pt-4 pb-6">
            <div
              className="w-12 h-12 rounded-2xl grid place-items-center mb-4"
              style={{
                background: COLORS.accentSoft,
                border: `1px solid ${COLORS.accent}30`,
              }}
            >
              <Icon name="mic" size={22} color={COLORS.accent} />
            </div>
            <DrawerTitle
              className="text-lg font-bold mb-1"
              style={{ color: COLORS.w }}
            >
              {t("record.tipsTitle")}
            </DrawerTitle>
            <DrawerDescription
              className="text-[13px] leading-relaxed mb-4"
              style={{ color: COLORS.t3 }}
            >
              Tarjuman captures audio from speakers in halls and masjids
              — a few seconds of setup makes a big difference.
            </DrawerDescription>

            <ul className="flex flex-col gap-3 mb-5">
              {TIPS.map((tip) => (
                <li key={tip.title} className="flex gap-3">
                  <div
                    className="w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 mt-[2px]"
                    style={{
                      background: COLORS.surfaceLight,
                      border: `1px solid ${COLORS.borderLight}`,
                    }}
                  >
                    <span
                      className="text-[13px] font-bold"
                      style={{ color: COLORS.accent }}
                    >
                      {tip.icon}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div
                      className="text-[14px] font-semibold mb-[2px]"
                      style={{ color: COLORS.w }}
                    >
                      {tip.title}
                    </div>
                    <div
                      className="text-[12px] leading-[1.5]"
                      style={{ color: COLORS.t3 }}
                    >
                      {tip.body}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div
              className="px-3 py-2 rounded-lg text-[12px] mb-4 flex items-start gap-2"
              style={{
                background: COLORS.amberSoft,
                border: `1px solid ${COLORS.amber}40`,
                color: COLORS.t2,
              }}
            >
              <span aria-hidden style={{ color: COLORS.amber }}>
                ●
              </span>
              <span>
                Watch the audio meter while recording. If it stays low for more
                than a couple of seconds, move closer to the speaker.
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleClose(false)}
              className="w-full h-12 rounded-xl font-bold text-sm cursor-pointer transition-transform active:scale-[0.98]"
              style={{
                background: COLORS.accent,
                color: "#0A0F1C",
                boxShadow: `0 0 24px ${COLORS.accent}35`,
              }}
            >
              {t("record.gotIt")}
            </button>
          </div>
      </DrawerContent>
    </Drawer>
  );
}

const TIPS: { icon: string; title: string; body: string }[] = [
  {
    icon: "1",
    title: "Get close to the speaker",
    body: "1–2 metres is ideal. The further away, the more the room itself ends up in the recording.",
  },
  {
    icon: "2",
    title: "Point the bottom of your phone at the sound",
    body: "Most mics are at the bottom edge. Aiming them at the source picks up speech more clearly.",
  },
  {
    icon: "3",
    title: "Don't cover the mic",
    body: "A hand or a thick case over the bottom edge muffles everything.",
  },
  {
    icon: "4",
    title: "Quieter rooms = better transcripts",
    body: "Crowd noise, AC hum, and echo all reduce accuracy. We filter what we can — the rest is physics.",
  },
];
