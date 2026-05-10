"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import type { LiveSegment } from "@/types";

export interface UseTranslatorOptions {
  segments: LiveSegment[];
  sourceLanguage: string;
  targetLanguage: string;
}

export interface UseTranslatorReturn {
  /** Map from segment id → translated text. Missing keys mean "not yet translated". */
  translations: Record<string, string>;
  /** Set of segment ids currently in-flight. */
  pending: Set<string>;
  /** Map from segment id → error message, if translation failed for that segment. */
  errors: Record<string, string>;
  reset: () => void;
}

/**
 * Translates each finalized segment exactly once.
 *
 * - Interim results are never translated (they change constantly; wasted API calls).
 * - In-flight requests are tracked per-segment so React StrictMode dev double-mount
 *   or rapid segment arrival can't fire duplicate requests for the same id.
 * - When source === target, segments pass through verbatim without an API call.
 */
export function useTranslator({
  segments,
  sourceLanguage,
  targetLanguage,
}: UseTranslatorOptions): UseTranslatorReturn {
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlightRef = useRef<Set<string>>(new Set());
  const [, forcePendingRender] = useState(0);
  // Convex Auth token — attached as Bearer to /api/translate so the route
  // can authorize the call and rate-limit the user. Auth is validated
  // server-side; we never trust the client to declare its own user.
  const authToken = useAuthToken();

  const reset = () => {
    setTranslations({});
    setErrors({});
    inFlightRef.current = new Set();
    forcePendingRender((n) => n + 1);
  };

  useEffect(() => {
    if (sourceLanguage === targetLanguage) {
      // Identity case: mirror source text into translations so the UI still
      // renders the green card without going through the translator API.
      setTranslations((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const seg of segments) {
          if (seg.isFinal && next[seg.id] === undefined) {
            next[seg.id] = seg.text;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      return;
    }

    const toTranslate = segments.filter(
      (s) =>
        s.isFinal &&
        translations[s.id] === undefined &&
        !inFlightRef.current.has(s.id) &&
        !errors[s.id]
    );
    if (toTranslate.length === 0) return;

    let cancelled = false;

    for (const seg of toTranslate) {
      inFlightRef.current.add(seg.id);
      forcePendingRender((n) => n + 1);

      void (async () => {
        try {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
          const res = await fetch("/api/translate", {
            method: "POST",
            headers,
            body: JSON.stringify({
              text: seg.text,
              source: sourceLanguage,
              target: targetLanguage,
            }),
          });
          if (cancelled) return;
          const data = (await res.json().catch(() => ({}))) as {
            translatedText?: string;
            error?: string;
          };
          if (!res.ok || !data.translatedText) {
            const msg = data.error ?? `Translation failed (${res.status})`;
            setErrors((prev) => ({ ...prev, [seg.id]: msg }));
          } else {
            setTranslations((prev) => ({
              ...prev,
              [seg.id]: data.translatedText!,
            }));
          }
        } catch (e) {
          if (cancelled) return;
          setErrors((prev) => ({
            ...prev,
            [seg.id]: e instanceof Error ? e.message : String(e),
          }));
        } finally {
          inFlightRef.current.delete(seg.id);
          if (!cancelled) forcePendingRender((n) => n + 1);
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [segments, sourceLanguage, targetLanguage, translations, errors, authToken]);

  return {
    translations,
    pending: inFlightRef.current,
    errors,
    reset,
  };
}
