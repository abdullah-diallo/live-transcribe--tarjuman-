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
 * everywhere. The others are experiments applied ONLY on localhost — same
 * mechanism as SHOW_PRICING. Nothing shipped is deleted or rewritten when we
 * try one: to go back, point ACTIVE_PALETTE_NAME at "tarjuman" (production
 * already uses it regardless).
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

/**
 * GOLD — gold on warm near-black, from the supplied ramp:
 *   #FFE169 #FAD643 #EDC531 #DBB42C #C9A227
 *   #B69121 #A47E1B #926C15 #805B10 #76520E
 *
 * This ramp is MONOCHROMATIC — ten tints of one hue, with no dark base and no
 * second family — so two decisions had to be made rather than read off it:
 *
 *   1. The page is NOT gold. Every swatch here is a mid-to-light yellow; a
 *      gold background would be a lit screen in a dark room, which is the one
 *      thing this app must not be. The base is a warm near-black derived to
 *      sit under the ramp, and the gold does the work in the accent, borders
 *      and text — the classic gold-on-dark reading.
 *   2. Roles that must stay distinguishable can't all be gold. Record-vs-
 *      paused separates by LIGHTNESS (bright gold vs dimmer old-gold), stop
 *      stays red, and the source-language pane takes a muted steel blue: with
 *      a gold accent the two transcript panes would otherwise be the same
 *      colour, and blue-and-gold is the pairing this audience already reads
 *      as mosque tilework rather than as a random extra hue.
 *
 * Borders and soft fills are gold-tinted (not white/neutral) so the chrome
 * reads warm all the way through instead of only at the accent.
 */
export const PALETTE_GOLD: Palette = {
  bg: "#12100A",
  surface: "#1C1810",
  surfaceLight: "#2A2216",
  border: "rgba(250,214,67,0.12)",
  borderLight: "rgba(250,214,67,0.22)",
  accent: "#FAD643",
  // A near shade of the accent (hover/gradient), NOT the paused colour — those
  // two must stay far apart or a hovered record button reads as paused.
  accentDk: "#DBB42C",
  accentSoft: "rgba(250,214,67,0.12)",
  red: "#EF4444",
  redSoft: "rgba(239,68,68,0.12)",
  // Old gold. Measured: 2.65x luminance apart from the accent (vs 1.70x for a
  // mid gold) — with one hue to work with, that lightness gap is the only thing
  // telling "paused" apart from "recording", so it is deliberately this dim.
  amber: "#A47E1B",
  amberSoft: "rgba(164,126,27,0.20)",
  blue: "#6E8BA6",
  blueSoft: "rgba(110,139,166,0.16)",
  w: "#FBF5E6",
  t2: "#D8CBAA",
  t3: "#9C8E70",
  t4: "#6B6048",
};

/**
 * NOIR — gold on true black, over a brown depth ramp, from the supplied set:
 *   #FFE169 #E5C55F #D1AF57
 *   #7F5539 #735238 #5C422D #4A3524 #3B2A1D #2F2217
 *   #000000
 *
 * Unlike the other two experiments this ramp maps itself, because it splits
 * cleanly by measured luminance on black:
 *   - the three GOLDS are 16.2 / 12.5 / 10.0 contrast — all AAA, so they are
 *     the content and accent layer;
 *   - every BROWN is 3.3 or below — unusable as text, which is exactly what a
 *     depth ramp should be, so they build background → card → raised;
 *   - #000000 is the page. True black is the right base for the primary use
 *     case (a phone held in a dark masjid, usually OLED, where black pixels
 *     emit no light at all).
 *
 * Role notes:
 *   - The lightest brown sits 4.98x from the accent, so source-language cards
 *     (brown edge) and translation cards (gold edge) are the most separated
 *     pair of any palette here. That matters more than anywhere else: the two
 *     transcript panes are what a user reads for the entire session.
 *   - Record vs paused separates by only 1.63x, because after the accent and
 *     its hover shade there is one gold left. That is the accepted cost of
 *     spending the strongest separation on the transcript panes instead —
 *     paused also changes its icon, freezes the timer, and shows a filled
 *     banner, so colour is not carrying that state alone.
 *   - red stays red for stop/destructive.
 */
export const PALETTE_NOIR: Palette = {
  bg: "#000000",
  surface: "#2F2217",
  surfaceLight: "#4A3524",
  border: "rgba(255,225,105,0.12)",
  borderLight: "rgba(255,225,105,0.2)",
  accent: "#FFE169",
  accentDk: "#E5C55F",
  accentSoft: "rgba(255,225,105,0.12)",
  red: "#EF4444",
  redSoft: "rgba(239,68,68,0.14)",
  amber: "#D1AF57",
  // Deliberately a stronger fill than the other palettes use: with only 1.63x
  // of lightness between the accent and this, the paused control leans on
  // being visibly FILLED rather than on hue.
  amberSoft: "rgba(209,175,87,0.22)",
  blue: "#7F5539",
  blueSoft: "rgba(127,85,57,0.22)",
  w: "#F5EFE2",
  t2: "#CBBBA0",
  t3: "#9A8A72",
  t4: "#6B5D4A",
};

export const PALETTES = {
  tarjuman: PALETTE_TARJUMAN,
  sunset: PALETTE_SUNSET,
  gold: PALETTE_GOLD,
  noir: PALETTE_NOIR,
} as const;

export type PaletteName = keyof typeof PALETTES;

/**
 * Which palette is live.
 *
 * Localhost (`next dev` → NODE_ENV "development") renders the palette named
 * here so it can be judged in the real UI; the deployed site always keeps the
 * shipped TARJUMAN palette. Same switch style as SHOW_PRICING.
 *
 * Change the name below to try another ("noir" | "gold" | "sunset" | "tarjuman").
 * To ship whichever wins → hardcode it (drop the NODE_ENV check).
 */
export const ACTIVE_PALETTE_NAME: PaletteName =
  process.env.NODE_ENV === "development" ? "noir" : "tarjuman";

export const ACTIVE_PALETTE: Palette = PALETTES[ACTIVE_PALETTE_NAME];
