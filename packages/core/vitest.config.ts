import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    coverage: { provider: "v8", include: ["src/decoders/**", "src/rules.ts", "src/scoring.ts", "src/classify.ts", "src/hash.ts", "src/base58.ts"], thresholds: { lines: 90, functions: 90, statements: 90 } },
  },
});
