/**
 * Shared Islamic-terminology rules + few-shot examples used by both the
 * /api/translate and /api/summarize prompts.
 *
 * Why a shared module:
 *   The whole reason this app uses an LLM (instead of Google Translate) is
 *   to preserve Islamic vocabulary correctly. The translate route runs per
 *   transcript segment; the summarize route runs once at the end. Both must
 *   apply the same vocabulary rules — keeping them in one place prevents
 *   drift.
 *
 * Why this is long:
 *   Anthropic's prompt-cache thresholds are 1024 tokens (Sonnet) and 2048
 *   tokens (Haiku). A short prompt would be re-billed at full price every
 *   call. By making the rules+examples block comfortably exceed both
 *   thresholds, every recording session after the first call pays roughly
 *   1/10th the input cost — and the prompt is *better* for it because the
 *   model has more in-context examples and structured guidance.
 */

export const ISLAMIC_TERMINOLOGY_RULES = `
## Islamic terminology rules (apply when translating or summarizing Arabic religious content — khutbahs, lectures, classes, Quran study)

The user is a non-Arabic-speaking Muslim attending lectures. They expect English text that uses the conventional Islamic-English vocabulary, NOT generic translations.

### Rule 1 — Divine names and honorifics: NEVER translate these to generic English equivalents.

- "Allah" — never "God." Always Allah.
- "Allahu Akbar" — preserve verbatim.
- "Subhan'Allah" / "Subhanahu wa Ta'ala" — preserve. If the speaker says "سبحانه وتعالى" inline, write "(Subhanahu wa Ta'ala)" or its abbreviation "(SWT)" after Allah.
- "Alhamdulillah" — preserve.
- "Bismillah" — preserve. If the full "بسم الله الرحمن الرحيم" is spoken, render as "Bismillahir Rahmanir Raheem" or "In the name of Allah, the Most Gracious, the Most Merciful."
- "Astaghfirullah" — preserve.
- "La ilaha illa Allah" — preserve, do not translate to "There is no god but God."
- "Mashaa'Allah", "Inshaa'Allah", "Barakallahu feek" — preserve verbatim.
- The honorific ﷺ (Sallallahu Alayhi Wa Sallam) follows the Prophet Muhammad's name. Always include either the symbol "ﷺ" or "(peace be upon him)" / "(PBUH)" after every mention of the Prophet.
- Other prophets get "(peace be upon him)" or "(a.s.)" / "(عليه السلام)": Ibrahim (a.s.), Musa (a.s.), Isa (a.s.), etc. Do NOT use Anglicized names (Abraham, Moses, Jesus) when the speaker used Arabic names.

### Rule 2 — Quranic verses: render the meaning, do not transliterate.

If a transcript segment is a Quranic verse, output the standard English meaning. Do not phonetically transliterate the Arabic. If the speaker stated the surah name and ayah number ("Surah Al-Baqarah, ayah 255"), preserve that reference.

For famous formulaic verses, use the conventional English rendering:
- إنا لله وإنا إليه راجعون → "Indeed, to Allah we belong and to Him we shall return"
- بسم الله الرحمن الرحيم → "In the name of Allah, the Most Gracious, the Most Merciful"
- لا حول ولا قوة إلا بالله → "There is no power and no might except with Allah"
- الحمد لله رب العالمين → "All praise is due to Allah, Lord of the Worlds"

### Rule 3 — Worship, ritual, and fiqh terms: preserve transliterations.

Do NOT translate any of these to a generic English equivalent. Use the transliteration. The audience knows these words.

Worship & ritual:
- Salah / Salat (the five daily prayers) — not "prayer"
- Wudu (ablution before prayer)
- Ghusl (full ritual washing)
- Tayammum (dry ablution)
- Sajdah / Sujood (prostration)
- Ruku (bowing)
- Rakah (a unit of prayer)
- Adhan (call to prayer) — not "the call"
- Iqamah (second call before prayer starts)
- Imam (prayer leader)
- Mu'adhin (the one calling the adhan)
- Khutbah (sermon)
- Tarawih, Witr, Tahajjud (specific prayers)
- Niyyah (intention)

Fiqh categorizations:
- Halal (permissible) — preserve, gloss only on first use
- Haram (forbidden) — same
- Makruh (disliked)
- Mustahabb (recommended)
- Wajib (obligatory)
- Fard (obligatory — fard ayn vs fard kifayah are technical distinctions worth preserving when used)
- Sunnah Muakkadah (emphasized) / Ghair Muakkadah (non-emphasized)

### Rule 4 — Concepts, character, eschatology: preserve.

- Iman (faith)
- Taqwa (God-consciousness)
- Tawheed (oneness of Allah)
- Shirk (associating partners with Allah)
- Sabr (patience)
- Shukr (gratitude)
- Tawakkul (reliance on Allah)
- Tawbah (repentance)
- Ikhlas (sincerity)
- Riya (showing off in worship)
- Ihsan (excellence in worship)
- Jannah (paradise) — not "heaven"
- Jahannam (hell) — not "fire" generically
- Akhirah (the hereafter)
- Dunya (this worldly life)
- Qiyamah (the Day of Judgment)
- Mizan (the scale of deeds)

### Rule 5 — Beings.

- Mala'ika (angels) — preserve when speaker uses
- Jinn — preserve
- Iblis / Shaytan — preserve, do not translate to "Satan" or "Devil"
- Mu'min (believer)
- Munafiq (hypocrite)
- Kafir (disbeliever) — preserve, do not soften
- Mushrik (one who commits shirk)

### Rule 6 — People and history.

- Sahaba / Sahabiyat (the Companions of the Prophet, male / female)
- Tabiun (the generation after the Companions)
- Ahl al-Bayt (the Prophet's household)
- Khulafa Rashidun (the Rightly Guided Caliphs)
- Sirah / Seerah (the Prophet's biography)
- Hadith (preserved sayings of the Prophet)
- Sunnah (the Prophet's example) — distinct from "sunnah" as a fiqh ruling
- Hijra (the migration to Madinah)

### Rule 7 — Pillars and events.

- Hajj (the pilgrimage)
- Umrah (the lesser pilgrimage)
- Zakat (obligatory charity)
- Sadaqah (voluntary charity)
- Fitra (charity at the end of Ramadan)
- Sawm / Siyam (fasting)
- Ramadan, Eid, Eid al-Fitr, Eid al-Adha
- Iftar (breaking the fast), Suhoor (pre-dawn meal)

### Rule 8 — Place names: prefer Arabic forms when used.

- Makkah (Mecca is also acceptable but match the speaker)
- Madinah (Medina)
- Masjid (mosque) — preserve, especially "Masjid an-Nabawi," "Masjid al-Haram," "Masjid al-Aqsa"
- Kaaba (Ka'bah) — preserve

### Rule 9 — Spelling: use the most common transliteration.

When multiple spellings exist (Quran/Qur'an, Salah/Salat, Subhan'Allah/SubhanAllah), pick the most readable common form. Be consistent within a single output.

### Rule 10 — When in doubt, preserve.

If you're uncertain whether a term is religious vocabulary the audience would expect to see in transliteration, err on the side of preserving. The audience prefers seeing "Sabr" they need to recognize over a generic "patience" that strips meaning.
`.trim();

export const ISLAMIC_FEW_SHOT_EXAMPLES = `
## Worked translation examples

These show the expected style for Arabic → English translation. Match this register and term handling.

### Example 1 — khutbah opening
Input:  الحمد لله نحمده ونستعينه ونستغفره، ونعوذ بالله من شرور أنفسنا وسيئات أعمالنا
Output: All praise is due to Allah, we praise Him, seek His help, and seek His forgiveness. We seek refuge in Allah from the evils of our souls and the wickedness of our deeds.

### Example 2 — Quranic verse with reference
Input:  قال الله تعالى في سورة البقرة: إنا لله وإنا إليه راجعون
Output: Allah (Subhanahu wa Ta'ala) said in Surah Al-Baqarah: "Indeed, to Allah we belong and to Him we shall return."

### Example 3 — fiqh sentence with multiple terms
Input:  الصلاة فرض على كل مسلم، والصدقة سنة مؤكدة
Output: Salah is fard upon every Muslim, and Sadaqah is a Sunnah Muakkadah.

### Example 4 — mention of the Prophet ﷺ
Input:  قال النبي محمد: إنما الأعمال بالنيات
Output: The Prophet Muhammad ﷺ said: "Actions are but by intentions."

### Example 5 — common formulaic phrase
Input:  لا حول ولا قوة إلا بالله
Output: La hawla wa la quwwata illa billah (there is no power and no might except with Allah).

### Example 6 — speaker references multiple prophets
Input:  أرسل الله إبراهيم وموسى وعيسى ومحمدا
Output: Allah sent Ibrahim (a.s.), Musa (a.s.), Isa (a.s.), and Muhammad ﷺ.

### Example 7 — partial / truncated segment (live transcription artifact)
The STT engine sometimes commits a segment that ends mid-word. Translate
what is there and end with "..." — never add a parenthetical note about
the cut, never ask the user to provide the rest.
Input:  ان الحمد لله نحو
Output: All praise is due to Allah...
`.trim();
