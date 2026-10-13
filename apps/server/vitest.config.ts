import path from "node:path";

import { defineConfig } from "vitest/config";

const rootDir = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(rootDir, "src"),
      },
      {
        find: "cloudflare:workers",
        replacement: path.resolve(rootDir, "tests/stubs/cloudflare-workers.ts"),
      },
    ],
  },
  test: {
    clearMocks: true,
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
