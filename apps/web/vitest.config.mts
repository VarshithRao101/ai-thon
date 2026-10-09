import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      // Next.js resolves "server-only" to a no-op on the server; mirror that in tests.
      "server-only": path.resolve(
        import.meta.dirname,
        "test/stubs/server-only.ts"
      ),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "e2e/**",
      "lib/next-boilerplate/**",
    ],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
