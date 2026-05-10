// Runs on every client page load. Initializes Sentry early so unhandled
// errors during initial render are captured.
import { initSentry } from "./lib/sentry";

initSentry("client");

export const onRouterTransitionStart = () => {
  // Sentry's recommended hook for capturing slow Next.js client-side
  // transitions. Cheap; no-op if Sentry isn't initialized.
};
