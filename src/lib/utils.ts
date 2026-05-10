import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { LANGUAGES, type LanguageCode } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDate(dateInput: number | string | Date): string {
  const d = new Date(dateInput);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function getLangName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

export function getLangNative(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.native ?? code;
}

export function isRtl(code: string): boolean {
  return LANGUAGES.find((l) => l.code === code)?.rtl ?? false;
}

export function isValidLangCode(code: string): code is LanguageCode {
  return LANGUAGES.some((l) => l.code === code);
}
