/**
 * Colour palettes.
 *
 * The app renders colour from two places that MUST agree:
 *   1. the `COLORS` object (inline `style={{ ... }}` across the components), and
 *   2. the `--color-*` custom properties in globals.css (Tailwind arbitrary
 *      values like `bg-[var(--color-surface)]`).
 * Both are driven from here so a palette can be swapped in one edit.
 *
 * TARJUMAN (green on near-black) is the SHIPPED palette and the default
 * everywhere. SUNSET (orange on deep violet) is an experiment that is applied
 * ONLY on localhost — same mechanism as SHOW_PRICING. Nothing about the
 * original is deleted or rewritten: to go back, flip ACTIVE_PALETTE_NAME to
 * "tarjuman" (or just ship, since production already uses it).
 */

export interface Palette {
  /** Page background — the darkest surface. */
  bg: string;
  /** Cards, sheets, the recording shell. */
  surface: string;
  /** Raised/hover state above `surface`. */
  surfaceLight: string;
  border: string;
  borderLight: string;
  /** Primary action + "this is working": record button, translation card, links. */
  accent: string;
  /** Deeper accent for gradients, hovers and pressed states. */
  accentDk: string;
  /** ~10% accent — tinted fills behind accent content. */
  accentSoft: string;
  /** Destructive / stop. */
  red: string;
  redSoft: string;
  /** Attention that is NOT destructive: paused, warnings, "check this". */
  amber: string;
  amberSoft: string;
  /** The "other" voice — source-language cards, informational chips. */
  blue: string;
  blueSoft: string;
  /** Text ramp, brightest → dimmest. */
  w: string;
  t2: string;
  t3: string;
  t4: string;
}

/** The shipped palette. Green on near-black. Do not edit to try a new look —
 *  add another palette below instead, so this one stays revertible. */
export const PALETTE_TARJUMAN: Palette = {
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
};

/**
 * SUNSET — orange on deep violet, from the supplied ramp:
 *   #FF6D00 #FF7900 #FF8500 #FF9100 #FF9E00
 *   #240046 #3C096C #5A189A #7B2CBF #9D4EDD
 *
 * Role mapping (the palette is two hue families, so states are separated by
 * FAMILY and by LIGHTNESS rather than by hue alone):
 *   violet ramp  → depth: background → card → raised
 *   bright orange → accent (record, active, translation)
 *   burnt orange  → amber role (paused, warnings) — deliberately the deepest
 *     orange so it reads differently from the bright accent at a glance, and
 *     still stands out against a violet background (a violet warning banner on
 *     a violet surface would disappear).
 *   light violet  → blue role (source-language cards): the clearest "other
 *     voice" against the orange accent.
 *   red stays red — stop/destructive must never be a palette-tinted guess.
 * Text is a violet-tinted neutral ramp so it sits on the violet base without
 * looking cold.
 */
export const PALETTE_SUNSET: Palette = {
  bg: "#240046",
  surface: "#3C096C",
  surfaceLight: "#5A189A",
  // Slightly stronger than the near-black theme: identical alphas read fainter
  // on a lighter violet surface.
  border: "rgba(255,255,255,0.08)",
  borderLight: "rgba(255,255,255,0.14)",
  accent: "#FF9100",
  accentDk: "#FF6D00",
  accentSoft: "rgba(255,145,0,0.12)",
  red: "#EF4444",
  redSoft: "rgba(239,68,68,0.12)",
  amber: "#FF6D00",
  amberSoft: "rgba(255,109,0,0.12)",
  blue: "#9D4EDD",
  blueSoft: "rgba(157,78,221,0.14)",
  w: "#F7F2FF",
  t2: "#CDBDE6",
  t3: "#9781B8",
  t4: "#6B5590",
};

export const PALETTES = {
  tarjuman: PALETTE_TARJUMAN,
  sunset: PALETTE_SUNSET,
} as const;

export type PaletteName = keyof typeof PALETTES;

/**
 * Which palette is live.
 *
 * Localhost (`next dev` → NODE_ENV "development") gets SUNSET so it can be
 * judged in the real UI; the deployed site keeps the shipped TARJUMAN palette.
 * Same switch style as SHOW_PRICING.
 *
 * To keep sunset after trying it → hardcode "sunset".
 * To drop the experiment → hardcode "tarjuman" (or delete PALETTE_SUNSET).
 */
export const ACTIVE_PALETTE_NAME: PaletteName =
  process.env.NODE_ENV === "development" ? "sunset" : "tarjuman";

export const ACTIVE_PALETTE: Palette = PALETTES[ACTIVE_PALETTE_NAME];
