export const LANGUAGES = [
  // Tier 1 — Excellent (code-switching supported)
  { code: "en", name: "English", native: "English", rtl: false },
  { code: "es", name: "Spanish", native: "Español", rtl: false },
  { code: "fr", name: "French", native: "Français", rtl: false },
  { code: "de", name: "German", native: "Deutsch", rtl: false },
  { code: "pt", name: "Portuguese", native: "Português", rtl: false },
  { code: "it", name: "Italian", native: "Italiano", rtl: false },
  { code: "nl", name: "Dutch", native: "Nederlands", rtl: false },
  { code: "ru", name: "Russian", native: "Русский", rtl: false },
  { code: "hi", name: "Hindi", native: "हिन्दी", rtl: false },
  { code: "ja", name: "Japanese", native: "日本語", rtl: false },

  // Tier 2 — Very good
  { code: "ar", name: "Arabic", native: "العربية", rtl: true },
  { code: "ko", name: "Korean", native: "한국어", rtl: false },
  { code: "zh", name: "Chinese", native: "中文", rtl: false },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", rtl: false },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", rtl: false },
  { code: "ms", name: "Malay", native: "Bahasa Melayu", rtl: false },
  { code: "tr", name: "Turkish", native: "Türkçe", rtl: false },
  { code: "pl", name: "Polish", native: "Polski", rtl: false },
  { code: "cs", name: "Czech", native: "Čeština", rtl: false },
  { code: "hu", name: "Hungarian", native: "Magyar", rtl: false },
  { code: "no", name: "Norwegian", native: "Norsk", rtl: false },
  { code: "sv", name: "Swedish", native: "Svenska", rtl: false },
  { code: "da", name: "Danish", native: "Dansk", rtl: false },
  { code: "fi", name: "Finnish", native: "Suomi", rtl: false },
  { code: "el", name: "Greek", native: "Ελληνικά", rtl: false },
  { code: "he", name: "Hebrew", native: "עברית", rtl: true },
  { code: "ro", name: "Romanian", native: "Română", rtl: false },
  { code: "ca", name: "Catalan", native: "Català", rtl: false },
  { code: "uk", name: "Ukrainian", native: "Українська", rtl: false },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const COLORS = {
  bg: "#060B18",
  surface: "#0E1525",
  surfaceLight: "#151D30",
  border: "rgba(255,255,255,0.06)",
  borderLight: "rgba(255,255,255,0.1)",
  accent: "#2ECC71",
  accentDk: "#22A85A",
  accentSoft: "rgba(46,204,113,0.1)",
  red: "#EF4444",
  redSoft: "rgba(239,68,68,0.1)",
  amber: "#F59E0B",
  amberSoft: "rgba(245,158,11,0.1)",
  blue: "#3B82F6",
  blueSoft: "rgba(59,130,246,0.1)",
  w: "#F0F4F8",
  t2: "#B0BEC5",
  t3: "#6B7D8D",
  t4: "#455A64",
} as const;

// The landing pricing section + "Pricing" nav link are built but NOT public
// yet. Show them only on localhost (next dev → NODE_ENV "development"); they
// stay hidden on the live domain (Vercel prod build → "production"). Flip to a
// hard `true` to launch pricing to the live site.
export const SHOW_PRICING = process.env.NODE_ENV === "development";

/**
 * Which realtime STT engine the recording path uses.
 *
 * Speechmatics is primary as of the 2026-08 bake-off: on real Arabic khutbah
 * audio it returned whole coherent sentences at ~1.00 confidence where Deepgram
 * nova-3 fragmented into partial segments and dropped clauses. Deepgram stays
 * fully wired as the fallback — flip this one value to switch the whole app
 * back, and /dev/stt-compare always runs both regardless of this setting.
 *
 * Trade being made knowingly: Speechmatics finals land ~1.3-1.5s behind the
 * speaker vs Deepgram's ~0.4-0.8s. Accuracy wins; the transcript is the product.
 */
export const STT_PROVIDER: "speechmatics" | "deepgram" = "speechmatics";

/**
 * Whether /dev/stt-compare renders. It is a DEV TOOL, not a product surface:
 * each run opens TWO paid realtime sessions at once, and the Speechmatics free
 * tier allows only 2 CONCURRENT SESSIONS app-wide — so one signed-in user who
 * finds the route can block recording for everybody. It lives under (app),
 * where auth is the only guard, so it needs its own gate.
 *
 * On in dev (matching SHOW_PRICING's convention). The env escape hatch exists
 * because the comparison is most useful in the field — on a phone, in a real
 * masjid, against a deployed build — which a hard dev-only gate would prevent.
 * Set NEXT_PUBLIC_STT_COMPARE=1 on a preview deployment for a field test, and
 * leave it unset in production.
 */
export const STT_COMPARE_ENABLED =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_STT_COMPARE === "1";

/**
 * Speechmatics realtime tuning. `maxDelay` is the final-transcript latency
 * budget (vendor range 0.7-4s) — lower is snappier but gives the model less
 * right-context to correct itself, which is exactly what we're paying it for.
 * 1.5s was the value used in the bake-off that produced the winning output.
 */
export const SPEECHMATICS = {
  operatingPoint: "enhanced",
  maxDelay: 1.5,
  /**
   * Only used if the AudioContext somehow reports no rate. The REAL rate is
   * read from pcmNode.context.sampleRate at connect time — browsers that ignore
   * the 16kHz request hand back 44100/48000, and declaring the wrong one
   * garbles every transcript.
   */
  fallbackSampleRate: 16000,
  speakerLockWarmupMs: 15_000,
  speakerLockMinDurationS: 5,
  // Shorter than Deepgram's 25s: Speechmatics runs `prefer_current_speaker` and
  // held one stable label throughout testing rather than re-clustering mid-run.
  diarizeWarmupMs: 10_000,
  /**
   * Drop a finalized sentence below this mean word confidence.
   *
   * Matches the Deepgram floor's intent but sits lower relative to observed
   * output: Speechmatics reported 0.96-1.00 on genuine far-field khutbah speech
   * in testing, so anything under 0.45 is a strong noise signal rather than
   * merely distant speech.
   *
   * KNOWN TUNING ISSUE: this floor is Arabic-tuned. In the 2026-07-25 language
   * sweep it discarded 100% of Hungarian STT. Both engines' floors live in this
   * file precisely so that decision can be made in one place.
   */
  finalConfidenceFloor: 0.45,
} as const;

/**
 * Deepgram tuning — the FALLBACK engine (see STT_PROVIDER above). Mirrors the
 * SPEECHMATICS block field-for-field so the two engines' knobs can be read side
 * by side instead of being buried as private constants in two 700-line hooks.
 */
export const DEEPGRAM = {
  /**
   * Drop a final segment if Deepgram's confidence falls below this threshold.
   * Clean native-language speech scores 0.7-0.95, but FAR-FIELD PA capture in a
   * reverberant masjid (the primary use case) regularly drags real, correctly-
   * transcribed sentences down into the 0.45-0.6 band. A 0.55 floor was silently
   * discarding that legitimate speech — the "I'm talking but nothing appears"
   * report. Lowered to 0.45 so genuine quiet/distant speech survives; the
   * remaining off-language transliteration noise that lands in this band is
   * still caught downstream (the off-language script gate + the LLM
   * transliteration/noise verdict in /api/translate, which fails OPEN — it keeps
   * the source card, never the reverse). Tunable; raise if noise creeps in.
   */
  finalConfidenceFloor: 0.45,
  /**
   * Don't paint interim text below this confidence. Interims are partial
   * hypotheses so they score lower than finals — this floor is deliberately
   * lenient. It exists so off-language speech (which Deepgram, forced to the
   * session language, transcribes as low-confidence transliterated noise)
   * doesn't continuously flash garbage in the live view while every final
   * gets dropped by the filters downstream. Real source-language speech
   * crosses 0.4 within the first word or two.
   */
  interimConfidenceFloor: 0.4,
  /** Off-language drop: only drop if the language-detection confidence exceeds this. */
  languageMismatchDropThreshold: 0.7,
  speakerLockWarmupMs: 15_000,
  speakerLockMinDurationS: 5,
  /**
   * Deepgram's LIVE diarizer ascribes all speech to speaker 0 for the first
   * ~20-30s, then re-clusters and may re-number the SAME speaker to a higher
   * index. Ignore diarization (no lock accounting, no per-segment speaker id)
   * within this window so a lone speaker isn't split into "Speaker 1" + "2".
   * Much longer than Speechmatics' 10s for exactly this reason.
   */
  diarizeWarmupMs: 25_000,
  keepAliveIntervalMs: 5000,
} as const;

export const SEGMENT_FLUSH_INTERVAL_MS = 5000;
export const RECONNECT_BACKOFF = [
  1000, 2000, 4000, 8000, 16000, 30000,
] as const;
