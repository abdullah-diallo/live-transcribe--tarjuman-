/**
 * Empty-state starters, written for the actual user: a non-Arabic speaker at a
 * khutbah in Madinah who has questions and no one to ask.
 *
 * Every one is answerable from established knowledge — none of them needs a
 * fatwa. That's deliberate: the first exchange teaches the user what this tool
 * is for, and a starter that provoked a "> Ask a scholar" deferral would teach
 * the opposite.
 *
 * English-only by design, like the landing-page body copy — these run long
 * enough that a machine translation would read worse than the English.
 */
export const STARTER_PROMPTS = [
  "What does the khateeb say at the start of every khutbah?",
  "Explain the two parts of the Jumu'ah khutbah and what happens between them.",
  "What should I do if I arrive while the khutbah has already started?",
  "Why is Surah Al-Kahf read on Fridays? Give me a short summary.",
  "What is the adab of visiting Masjid an-Nabawi?",
  "What's the difference between fard, wajib, sunnah, and mustahabb?",
] as const;
