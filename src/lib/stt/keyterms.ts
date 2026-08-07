/**
 * Islamic-vocabulary keyterms for STT biasing.
 *
 * Both Deepgram (`keyterm=` query params, nova-3) and Speechmatics
 * (`additional_vocab` in StartRecognition) accept a list of domain terms that
 * bias the acoustic decoder toward words it would otherwise mangle. This is the
 * STT-side analogue of what ISLAMIC_TERMINOLOGY_RULES does on the LLM side:
 * the translation prompt can only preserve a term the transcript actually
 * contains, so biasing at capture time is strictly upstream of it.
 *
 * WHY THESE TERMS: a khutbah's hardest words for a general ASR model are the
 * fixed liturgical formulae and proper nouns — they're low-frequency in generic
 * training data but near-certain to appear here. Ordinary Arabic prose needs no
 * help; these do.
 *
 * SIZE DISCIPLINE. Both vendors penalize long lists:
 *   - Deepgram nova-3 accepts up to ~500 tokens (~100 words).
 *   - Speechmatics documents a ~15-SECOND session-initialization penalty for
 *     large `additional_vocab` lists — a real cost on a live connection.
 * So this list is deliberately short and high-yield. Resist growing it into a
 * glossary; add a term only when a field recording shows the engine missing it.
 */

/**
 * Arabic-script keyterms — used when the SOURCE language is Arabic (the primary
 * khutbah case). Written as the orator actually says them.
 */
export const ARABIC_KEYTERMS: readonly string[] = [
  // Divine names + the formulae that follow them
  "الله",
  "سبحانه وتعالى",
  "عز وجل",
  "تبارك وتعالى",
  "بسم الله الرحمن الرحيم",
  "الحمد لله رب العالمين",
  "لا إله إلا الله",
  "صلى الله عليه وسلم",
  "عليه السلام",
  "رضي الله عنه",
  "رحمه الله",
  // Structural khutbah vocabulary
  "الخطبة",
  "الجمعة",
  "القرآن الكريم",
  "الحديث",
  "السنة",
  "الصحابة",
  "التقوى",
  "الإيمان",
  "التوحيد",
  "الآخرة",
  "الجنة",
  "النار",
  // Practice
  "الصلاة",
  "الزكاة",
  "الصيام",
  "الحج",
  "الدعاء",
  "الاستغفار",
  "التوبة",
];

/**
 * Latin-script keyterms — used when the source language is NOT Arabic (e.g. an
 * English or Urdu lecture that still carries Islamic vocabulary). Deepgram and
 * Speechmatics both bias on surface form, so the script must match what the
 * engine is being asked to emit.
 */
export const LATIN_KEYTERMS: readonly string[] = [
  "Allah",
  "Subhanahu wa Ta'ala",
  "Azza wa Jall",
  "Bismillah",
  "Alhamdulillah",
  "SubhanAllah",
  "Astaghfirullah",
  "InshaAllah",
  "MashaAllah",
  "Rasulullah",
  "sallallahu alayhi wa sallam",
  "radiyallahu anhu",
  "khutbah",
  "Quran",
  "hadith",
  "Sunnah",
  "sahabah",
  "taqwa",
  "iman",
  "tawheed",
  "akhirah",
  "Jannah",
  "salah",
  "zakat",
  "sawm",
  "hajj",
  "dua",
  "tawbah",
  "sabr",
];

/**
 * Keyterms for a given source language. Arabic and Urdu are written in Arabic
 * script; everything else gets the transliterated set.
 */
export function keytermsFor(sourceLanguage: string): readonly string[] {
  const lang = sourceLanguage.toLowerCase().split("-")[0];
  return lang === "ar" || lang === "ur" ? ARABIC_KEYTERMS : LATIN_KEYTERMS;
}
