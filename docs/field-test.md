# Tarjuman field test — speaker-in-a-room proxy protocol

The core risk Tarjuman carries is **not in the code** — it's "does it transcribe
real, noisy, PA-speaker Arabic *usably*?" Static review and runtime smoke tests
can't answer that. This protocol lets you answer it **at home, any day, with two
phones and a YouTube khutbah** — so a real masjid on Friday is a *confirmation*,
not the first time the app meets real audio.

## Why a proxy test

The production environment is a phone capturing sound that has travelled through a
PA system, bounced off marble/concrete, and mixed with crowd noise, AC hum, and
reverb. Clean audio through headphones **lies to you** — it makes accuracy look far
better than the real use case. The proxy test deliberately reintroduces distance +
room noise so the numbers you see are honest.

## Setup

- **Source (Phone A or a laptop):** play a khutbah **you have already heard** (so you
  can judge accuracy against content you know). Prefer clear Modern Standard Arabic.
  Moderate volume — speaking volume, not maxed out.
- **Capture (Phone B):** open `https://tarjuman.live`, sign in, set **Arabic → English**,
  and place it **1–2 metres** from the speaker (the real masjid distance — NOT next to it).
- **Room noise:** run a fan or AC, add light background chatter. This is the whole point —
  do not test in a silent room.

## Run

1. Tap **Record**. Watch the **audio level meter** — if it sits low/red for more than a
   couple seconds, move the phone closer. (That meter exists precisely so you don't sit
   through 30 minutes and discover the transcript is garbage.)
2. Record **5–10 minutes**. Watch the live source transcript + translation appear.
3. Tap **Stop** → **Generate AI Summary** → read it.

## Score it (pass / fail)

- [ ] **Transcript is usable** — captures the main points. Not word-perfect; *usable*.
- [ ] **Islamic terms preserved** in the translation — *Allah, Subhan'Allah, ﷺ* stay intact
      (NOT flattened to "God"). This is the whole reason we use an LLM, not Google Translate.
- [ ] **Feels live** — text appears within ~1–2 s of the words being spoken.
- [ ] **No large dropped stretches**; off-language/noise is dropped, **not** hallucinated
      into plausible-but-fake words.
- [ ] **RTL correct** — Arabic source reads right-to-left and aligned correctly.
- [ ] **Summary is accurate** to the khutbah, and any **hadith/Quran citations resolve**
      (the keyless verification pass replaces them with the canonical text or marks them
      "— unverified" — they should never read as authentic when unconfirmed).

## Vary one thing at a time

Change a single variable per run so you learn where the envelope is:

- **Distance:** 1 m vs 3 m
- **Volume:** moderate vs quiet
- **Noise:** quiet room vs fan + chatter
- **Mic:** phone mic vs a wired earphone mic pointed at the speaker

Where it first breaks tells you the real-world operating range **before** you're standing
in a masjid depending on it.

## Pass bar

If the transcript is usable and the Islamic terms survive across at least the
**1–2 m + moderate-noise** condition, the core hypothesis holds and Friday is a
confirmation run. If it breaks even in a quiet room at 1 m, that's a tuning problem
(the STT engine/params in `src/lib/constants.ts`, the Web Audio pipeline gains) to
solve **before** Friday — not
a surprise to discover there.

## What this does NOT cover

- Live broadcasting to remote listeners (designed, not built).
- Billing (intentionally off until after the core is validated).
- Behaviour over a 1–3 h session (the proxy test is 5–10 min; longer sessions exercise
  the persistence/limits paths separately).
