"use client";

import { useEffect, useRef } from "react";

export interface TtsItem {
  id: string;
  text: string;
}

export interface UseTtsOptions {
  /** Master switch. When false, no new utterances queue and the current queue is cancelled. */
  enabled: boolean;
  /** True when the recording is paused — pause the synth, don't drop the queue. */
  paused: boolean;
  /** BCP-47 / ISO language code of the items being spoken (e.g. "en", "ar"). */
  language: string;
  /** Items to speak in order. The hook tracks which ids it has already spoken. */
  items: TtsItem[];
  /** Speaking rate (0.1 – 10). Default 1.0; live khutbah translation feels good at 1.05. */
  rate?: number;
}

/**
 * Live TTS playback over the browser's SpeechSynthesis API.
 *
 * Why SpeechSynthesis (vs Deepgram Aura / ElevenLabs / OpenAI TTS):
 *   Zero network latency — the synthesizer runs locally on the device.
 *   For live khutbah translation, latency beats voice quality. macOS and
 *   recent iOS have decent built-in voices for English and many other
 *   languages.
 *
 * Behavior:
 *   - Watches `items` for ids it hasn't spoken yet (tracked in a ref).
 *   - For each new item, queues a SpeechSynthesisUtterance. The browser's
 *     internal queue handles ordering — utterances play one after another.
 *   - When `paused` flips true: pause() the synth (the queue is preserved).
 *   - When `paused` flips back: resume().
 *   - When `enabled` flips false (or the hook unmounts): cancel() the queue
 *     so nothing keeps speaking after the user disabled audio or stopped
 *     the recording.
 *
 * iOS quirk: the very first speak() call must follow a user gesture or
 * Safari refuses. The user already tapped "record"; that gesture is enough
 * to authorize subsequent speak() calls in the same tab session.
 */
export function useTts({
  enabled,
  paused,
  language,
  items,
  rate = 1.05,
}: UseTtsOptions): void {
  // Track which ids we've already submitted to the synth queue so reordering
  // / state updates don't re-speak old items.
  const spokenIdsRef = useRef<Set<string>>(new Set());

  // Cache of available voices; refreshed on the `voiceschanged` event.
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Load voice list on mount + when the browser populates it asynchronously.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof speechSynthesis === "undefined") return;
    const refresh = () => {
      voicesRef.current = speechSynthesis.getVoices();
    };
    refresh();
    speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => {
      speechSynthesis.removeEventListener("voiceschanged", refresh);
    };
  }, []);

  // Pick the best voice for the given language: prefer local-service voices
  // (higher quality on macOS, lower latency everywhere), fall back to first
  // matching language code.
  const pickVoice = (lang: string): SpeechSynthesisVoice | null => {
    const voices = voicesRef.current;
    if (voices.length === 0) return null;
    const langLower = lang.toLowerCase();
    const matches = voices.filter((v) =>
      v.lang.toLowerCase().startsWith(langLower)
    );
    if (matches.length === 0) return null;
    return (
      matches.find((v) => v.localService) ?? matches[0] ?? null
    );
  };

  // Watch items for new ones to speak.
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    if (!enabled) return;

    const spoken = spokenIdsRef.current;
    for (const item of items) {
      if (spoken.has(item.id)) continue;
      if (!item.text || !item.text.trim()) {
        // Mark empty items as spoken so we don't re-evaluate them every render.
        spoken.add(item.id);
        continue;
      }
      spoken.add(item.id);
      try {
        const utt = new SpeechSynthesisUtterance(item.text);
        utt.lang = language;
        utt.rate = rate;
        const voice = pickVoice(language);
        if (voice) utt.voice = voice;
        speechSynthesis.speak(utt);
      } catch {
        // Some browsers throw if speak is called outside a user gesture
        // before any prior speak. Not fatal — will retry on next item.
      }
    }
  }, [items, enabled, language, rate]);

  // Pause / resume the active synth queue, preserving order.
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    if (!enabled) return;
    if (paused) {
      try {
        speechSynthesis.pause();
      } catch {}
    } else {
      try {
        speechSynthesis.resume();
      } catch {}
    }
  }, [paused, enabled]);

  // When disabled (toggle off) or unmount, cancel the queue completely.
  // Also reset the spoken-ids set so re-enabling later in the SAME session
  // doesn't replay everything — the live translator only adds NEW items.
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    if (enabled) return;
    try {
      speechSynthesis.cancel();
    } catch {}
  }, [enabled]);

  useEffect(() => {
    return () => {
      if (typeof speechSynthesis === "undefined") return;
      try {
        speechSynthesis.cancel();
      } catch {}
      spokenIdsRef.current = new Set();
    };
  }, []);
}
