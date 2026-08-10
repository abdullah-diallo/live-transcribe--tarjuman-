import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests for pure library logic (no network, no DOM). The citation
// fail-safe in src/lib/{sunnah,quran}.ts is the highest-risk code in the app —
// these tests lock in that an unverified hadith/Quran citation can never read
// as authentic. Run with `npm test`.
export default defineConfig({
  resolve: {
    alias: {
      // Mirror the `@/*` → `src/*` path mapping from tsconfig.json. Without
      // this, any module under test that imports via the alias fails to
      // resolve at run time — and because a load failure skips the whole file,
      // the suite reports FEWER tests rather than a failure in the code under
      // test. (src/lib/sunnah.ts had no imports at all until the citation
      // attribution gate landed, which is why this never surfaced before.)
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
