import { loadStripe, type Stripe, type Appearance } from "@stripe/stripe-js";
import { COLORS } from "@/lib/constants";

/**
 * Client-side Stripe helpers for the embedded (Custom Checkout) dark flow.
 *
 * `loadStripe` is called once at module scope per Stripe's guidance (the
 * resulting promise is cached). The publishable key is PUBLIC by design —
 * NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is inlined into the client bundle on
 * purpose (it is not the secret key).
 */
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
    );
  }
  return stripePromise;
}

export function hasStripeKey(): boolean {
  return !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
}

/**
 * Dark Appearance for the embedded checkout, matched to the active palette.
 * `theme: 'night'` is Stripe's dark base; every value below is read from COLORS
 * so the form follows whichever palette is live rather than a pinned green.
 *
 * The payment-method rows (Card / Amazon Pay / Cash App Pay) render inside a
 * cross-origin Stripe iframe, so our stylesheet cannot touch them — the hover
 * lift/glow the rest of the app uses has to be expressed here, in Stripe's
 * appearance rules, or those rows stay inert while everything around them
 * animates.
 */
export const DARK_APPEARANCE: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: COLORS.accent,
    colorBackground: COLORS.surface,
    colorText: COLORS.w,
    colorTextSecondary: COLORS.t2,
    colorTextPlaceholder: COLORS.t4, // muted placeholder
    colorDanger: COLORS.red, // #EF4444
    fontFamily: '"DM Sans", system-ui, sans-serif',
    borderRadius: "12px",
    spacingUnit: "4px",
  },
  // Pin the Stripe inputs/tabs to the app's tile look — dark tile background,
  // hairline border, and an accent-green focus ring — so the PaymentElement
  // reads as part of Tarjuman rather than a generic Stripe form.
  rules: {
    ".Input": {
      backgroundColor: COLORS.bg, // one step below the surface
      border: `1px solid ${COLORS.borderLight}`,
    },
    ".Input:focus": {
      border: `1px solid ${COLORS.accent}`,
      boxShadow: `0 0 0 1px ${COLORS.accent}`,
    },
    ".Tab, .Block": {
      backgroundColor: COLORS.bg,
      border: `1px solid ${COLORS.borderLight}`,
      transition: "border-color 200ms ease, box-shadow 200ms ease",
    },
    // Accent outline + glow, matching the app's hover convention. Stripe has no
    // transform primitive here, so the lift is expressed as the glow alone.
    ".Tab:hover": {
      border: `1px solid ${COLORS.accent}`,
      boxShadow: `0 0 18px ${COLORS.accent}3d`,
    },
    ".Tab--selected": {
      border: `1px solid ${COLORS.accent}`,
      boxShadow: `0 0 0 1px ${COLORS.accent}, 0 0 22px ${COLORS.accent}4d`,
    },
    ".Tab--selected:hover": {
      border: `1px solid ${COLORS.accent}`,
      boxShadow: `0 0 0 1px ${COLORS.accent}, 0 0 28px ${COLORS.accent}66`,
    },
    ".Label": { color: COLORS.t2 },
  },
};
