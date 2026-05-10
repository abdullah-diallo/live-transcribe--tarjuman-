"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, IconName } from "@/components/shared/icon";
import { COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TABS: { id: string; icon: IconName; label: string; href: string; matches: (p: string) => boolean }[] = [
  {
    id: "record",
    icon: "mic",
    label: "Record",
    href: "/record",
    matches: (p) => p === "/record",
  },
  {
    id: "history",
    icon: "history",
    label: "History",
    href: "/history",
    matches: (p) => p === "/history" || p.startsWith("/session/"),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center gap-0 border-t pt-2 pb-3"
      style={{
        background: COLORS.surface,
        borderColor: COLORS.border,
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
      }}
    >
      {TABS.map((tab) => {
        const active = tab.matches(pathname);
        const color = active ? COLORS.accent : COLORS.t4;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "flex flex-col items-center gap-[3px] px-8 py-[6px]",
              "transition-colors"
            )}
          >
            <Icon name={tab.icon} size={22} color={color} />
            <span
              className="text-[11px] font-semibold"
              style={{ color }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
