import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next.js's `import "server-only"` guard throws when imported from a
      // Client Component. Vitest runs the server modules directly, so route
      // the import to a no-op stub. Without this, db/index.ts, lib/env.ts,
      // lib/r2.ts and friends fail to load under vitest.
      "server-only": path.resolve(__dirname, "./tests/server-only-stub.ts"),
    },
  },
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
  },
});
