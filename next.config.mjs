// .mjs (not .ts) so the production runtime doesn't need TypeScript installed.
// At build time Next.js parses this file directly via Node's ESM loader.

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Fail the build on TS errors — don't silently let regressions through.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
