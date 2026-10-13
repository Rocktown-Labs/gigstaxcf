import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    // Vendored agent skills (skills addon)
    "**/.agents",
    // Generated files
    "**/routeTree.gen.ts",
    "**/src/env.ts",
    "packages/db/src/migrations",
  ],
});
