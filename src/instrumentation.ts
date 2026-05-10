/**
 * Next.js calls this once at server boot. We use it to initialize Sentry
 * for server-side route handlers and middleware.
 *
 * The client-side Sentry init lives in instrumentation-client.ts so it
 * runs on every page navigation, not just at server boot.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === undefined
  ) {
    const { initSentry } = await import("./lib/sentry");
    initSentry("server");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    const { initSentry } = await import("./lib/sentry");
    initSentry("edge");
  }
}

// Optional: Next.js will call onRequestError if exported here; @sentry/nextjs
// versions vary in whether they export this name. Leave commented and add
// back if your installed version supports it.
// export { onRequestError } from "@sentry/nextjs";
