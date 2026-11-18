import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@vault/crypto": fileURLToPath(new URL("../crypto/src", import.meta.url)) } },
  // jsQR over full-page pixels and 600k-iteration PBKDF2 run slowly when test files run in parallel.
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node", testTimeout: 30_000 },
});
