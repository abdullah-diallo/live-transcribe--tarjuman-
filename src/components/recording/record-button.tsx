"use client";

import { COLORS } from "@/lib/constants";
import { Icon } from "@/components/shared/icon";
import { useLocale } from "@/lib/i18n/locale-context";
import { RiveRecordButton } from "./rive-record-button";

interface IdleRecordButtonProps {
  onStart: () => void;
  disabled?: boolean;
}

export function IdleRecordButton({ onStart, disabled }: IdleRecordButtonProps) {
  const { t } = useLocale();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <button
        type="button"
        onClick={onStart}
        disabled={disabled}
        aria-label="Start recording"
        className="w-[120px] h-[120px] rounded-full border-0 cursor-pointer grid place-items-center transition-all duration-200 hover:scale-105 hover:brightness-110 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:brightness-100"
        style={{
          background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentDk})`,
          boxShadow: `0 0 40px ${COLORS.accent}30, 0 0 0 8px ${COLORS.accentSoft}`,
        }}
      >
        {/* Rive art if public/animations/record-button.riv exists, otherwise
            the mic icon below — see rive-record-button.tsx for the contract.
            Nothing is downloaded when the asset is absent. */}
        <RiveRecordButton
          state={0}
          className="grid h-full w-full place-items-center"
          fallback={<Icon name="mic" size={40} color="#fff" />}
        />
      </button>
      <span className="text-sm" style={{ color: COLORS.t3 }}>
        {t("record.tapToStart")}
      </span>
    </div>
  );
}
