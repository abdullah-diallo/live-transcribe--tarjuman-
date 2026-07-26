import { describe, it, expect } from "vitest";
import { PALETTES, PALETTE_TARJUMAN, type Palette } from "./palettes";

const entries = Object.entries(PALETTES) as [string, Palette][];

// Tokens that components hex-alpha-concatenate to fake transparency, e.g.
// `borderInlineStart: \`3px solid ${COLORS.accent}66\``. There are ~79 such
// sites. The trick ONLY works on a 6-digit hex: concatenating onto an
// `rgba(...)` value yields the string "rgba(255,145,0,0.12)66", which every
// browser drops silently — the border/background just disappears. A future
// palette that spells one of these as rgba() would break those sites with no
// error anywhere, so it is pinned here.
const HEX_ALPHA_CONCATENATED: (keyof Palette)[] = [
  "accent",
  "red",
  "amber",
  "blue",
  "w",
];

describe("palettes", () => {
  it.each(entries)("%s: concatenated tokens are 6-digit hex", (_name, p) => {
    for (const token of HEX_ALPHA_CONCATENATED) {
      expect(p[token]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it.each(entries)("%s: defines every token", (_name, p) => {
    for (const token of Object.keys(PALETTE_TARJUMAN) as (keyof Palette)[]) {
      expect(p[token], `${String(token)} is missing`).toBeTruthy();
    }
  });

  it.each(entries)("%s: every value is a usable CSS colour", (_name, p) => {
    for (const [token, value] of Object.entries(p)) {
      expect(
        value,
        `${token} = ${value}`
      ).toMatch(/^(#[0-9a-fA-F]{6}|rgba?\([\d\s.,]+\))$/);
    }
  });

  it("keeps the shipped palette exactly as it was", () => {
    // The whole point of adding a second palette is that the original stays
    // revertible. If someone "tidies" these values the fallback is gone.
    expect(PALETTE_TARJUMAN.bg).toBe("#060B18");
    expect(PALETTE_TARJUMAN.accent).toBe("#2ECC71");
    expect(PALETTE_TARJUMAN.amber).toBe("#F59E0B");
    expect(PALETTE_TARJUMAN.blue).toBe("#3B82F6");
    expect(PALETTE_TARJUMAN.w).toBe("#F0F4F8");
  });

  it("distinguishes the states that share a hue family", () => {
    // Sunset is orange-on-violet, so accent (record/active) and amber
    // (paused/warning) sit in the same family. They must still be visibly
    // different or the paused state reads as still-recording.
    for (const [, p] of entries) expect(p.accent).not.toBe(p.amber);
  });
});
