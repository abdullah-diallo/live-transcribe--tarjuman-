// .mjs (not .ts) so the production runtime doesn't need TypeScript installed.
// At build time Next.js parses this file directly via Node's ESM loader.
// `/config` (not the package root) — importing withSentryConfig from the root
// is deprecated in @sentry/nextjs v10 and stops working in v11. The root import
// also printed a deprecation notice on every dev boot.
import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to THIS directory. Without it Next walks up looking
  // for lockfiles, finds the stray ~/bun.lock in the home directory, picks that
  // as the root, and warns on every dev boot — still true now that our own
  // lockfile is also a bun.lock. Pinning it likewise keeps prod file-tracing
  // from reaching outside the project.
  outputFileTracingRoot: import.meta.dirname,
  typescript: {
    // Fail the build on TS errors — don't silently let regressions through.
    ignoreBuildErrors: false,
  },
  // The standalone /login and /signup pages were removed — the landing popup
  // (AuthModal) is the only sign-in surface now. Redirect any old bookmark,
  // crawler, or external link to the landing with the popup pre-opened, so
  // those URLs never 404. Temporary (307) in case auth ever gets a dedicated
  // page again (e.g. native-app deep links).
  async redirects() {
    return [
      { source: "/login", destination: "/?auth=signin", permanent: false },
      { source: "/signup", destination: "/?auth=signup", permanent: false },
    ];
  },
};

// Wrap for source-map upload → UNMINIFIED prod stack traces. This is a clean
// no-op until SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are set (in Vercel
// prod); locally and on previews without those, nothing uploads and the build is
// unaffected.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: false,
});
