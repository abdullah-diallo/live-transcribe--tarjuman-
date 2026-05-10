import { ReactNode } from "react";
import Link from "next/link";
import { COLORS } from "@/lib/constants";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="w-full mx-auto relative overflow-hidden flex flex-col"
      style={{
        maxWidth: 420,
        minHeight: "100dvh",
        background: COLORS.bg,
      }}
    >
      {children}
      <footer
        className="px-6 py-4 flex justify-center gap-4 text-[11px]"
        style={{ color: COLORS.t4 }}
      >
        <Link href="/privacy" style={{ color: COLORS.t4 }}>
          Privacy
        </Link>
        <Link href="/terms" style={{ color: COLORS.t4 }}>
          Terms
        </Link>
      </footer>
    </div>
  );
}
