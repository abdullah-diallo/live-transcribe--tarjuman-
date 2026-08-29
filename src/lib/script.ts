// Script-detection helpers for off-language gating.
//
// IMPORTANT (was previously documented wrong): the realtime connection is FORCED
// to the source language on BOTH engines (e.g. language=ar). On Deepgram this is
// not even optional — `language=multi` does NOT support Arabic, so it can't be
// used for the primary RTL case (see src/app/api/deepgram/route.ts). Under a
// forced source language the engine TRANSLITERATES off-language speech into the
// source script (English "okay" → "اوكي"), so a transliterated English aside is
// ~100% source-script and this ratio gate does NOT catch it — the active
// off-language defense is the LLM's transliteration/noise verdict in
// /api/translate. This gate still (a) catches the cases where the engine DOES
// emit Latin text in an RTL session, and (b) must FAIL-OPEN: it counts letters
// only, so valid Arabic containing digits (Hijri years, ayah/hadith numbers) is
// never wrongly dropped.
//
// Used both client-side (instant drop in use-speechmatics / use-deepgram, before
// a segment renders) and server-side (the noise filter in /api/translate, as a
// backstop).

const ARABIC_SCRIPT_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const HEBREW_SCRIPT_RE = /[֐-׿]/;

/** RTL source languages whose transcripts are script-gated. The STT connection
 *  is forced to the source language for these (NOT multilingual) — see header. */
export const RTL_LANGS = new Set(["ar", "ur", "he", "fa", "ps", "sd"]);

/**
 * True when `sourceLang` is RTL but `text` is predominantly NOT in that script
 * (<50% source-script letters) — i.e. off-language bleed (English in an Arabic
 * session). Returns false for non-RTL sources (not script-gated) and for
 * empty/letterless text (the caller's word-count check handles those).
 */
export function isOffLanguageScript(
  text: string,
  sourceLang: string | undefined
): boolean {
  if (!sourceLang || !RTL_LANGS.has(sourceLang.toLowerCase())) return false;
  // Denominator = LETTERS only. Digits (\p{N}) must NOT count as "non-source
  // script": engines render spoken numbers as Western (or
  // Arabic-Indic) digits, so a short valid Arabic segment citing a Hijri year /
  // ayah / hadith number (e.g. "سنة 1445") would otherwise drop below the 50%
  // ratio and be wrongly discarded — a fail-CLOSED drop of valid source speech,
  // which the off-language gate must never do. Stripping everything that is not
  // a letter leaves only letters in the ratio, so numbers are script-neutral.
  const visibleChars = text.trim().replace(/[^\p{L}]/gu, "");
  if (visibleChars.length === 0) return false;
  const scriptRe =
    sourceLang.toLowerCase() === "he" ? HEBREW_SCRIPT_RE : ARABIC_SCRIPT_RE;
  let scriptChars = 0;
  for (const ch of visibleChars) if (scriptRe.test(ch)) scriptChars++;
  return scriptChars / visibleChars.length < 0.5;
}
