import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // React 19's set-state-in-effect rule fires on legitimate external-sync
      // patterns this app relies on heavily: WebSocket connection state in
      // use-deepgram, RAF-driven audio level in audio-visualizer, interval-
      // driven elapsed time in use-session-timer, sticky-bottom scroll in
      // live-transcript. Each is "synchronize React state with an external
      // event stream" — the pattern the rule technically permits but its
      // syntactic check can't recognize. Downgraded to warn so it stays
      // visible without blocking builds; revisit during a polish pass.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
