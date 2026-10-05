import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack],
  ignorePatterns: [
    ...core.ignorePatterns,
    // Vendored agent skills (skills addon)
    "**/.agents",
    // Generated files
    "**/routeTree.gen.ts",
    "**/src/env.ts",
    "packages/db/src/migrations",
  ],
  overrides: [
    {
      // React Native Metro/Babel configs must stay CommonJS
      files: ["**/babel.config.js", "**/metro.config.js", "**/*.config.cjs"],
      rules: {
        "node/global-require": "off",
        "prefer-named-capture-group": "warn",
        "require-unicode-regexp": "warn",
        "unicorn/prefer-module": "off",
      },
    },
  ],
  // Style rules: surface as warnings, don't fail the gate. Scaffolded
  // shadcn/ui + Expo templates use `function` declarations and unsorted
  // keys; keep the signal without blocking the check.
  rules: {
    complexity: "warn",
    "func-names": "warn",
    "func-style": "warn",
    "import/no-named-as-default-member": "warn",
    "jsx-a11y/click-events-have-key-events": "warn",
    "jsx-a11y/label-has-associated-control": "warn",
    "jsx-a11y/no-noninteractive-element-interactions": "warn",
    "jsx-a11y/prefer-tag-over-role": "warn",
    "max-statements": "warn",
    // Sequential awaits in email/stub batch processing are intentional
    "no-await-in-loop": "warn",
    "no-inline-comments": "warn",
    "no-negated-condition": "warn",
    "no-nested-ternary": "warn",
    "no-use-before-define": "warn",
    // The db schema barrel is intentional (drizzle + better-auth conventions)
    "oxc/no-barrel-file": "off",
    "prefer-destructuring": "warn",
    "promise/prefer-await-to-callbacks": "warn",
    "promise/prefer-await-to-then": "warn",
    "react/function-component-definition": "warn",
    "react/no-unescaped-entities": "warn",
    "react/no-unstable-nested-components": "warn",
    "sort-keys": "warn",
    "typescript/no-empty-interface": "warn",
    "typescript/no-empty-object-type": "warn",
    "typescript/no-explicit-any": "warn",
    "typescript/no-non-null-assertion": "warn",
    "typescript/triple-slash-reference": "warn",
    // Method signatures on client interfaces keep third-party SDK classes
    // assignable (property signatures are strictly contravariant)
    "typescript/method-signature-style": "warn",
    "unicorn/catch-error-name": "off",
    "unicorn/consistent-function-scoping": "warn",
    "unicorn/no-array-sort": "warn",
    "unicorn/no-nested-ternary": "warn",
    "unicorn/prefer-export-from": "warn",
    "unicorn/prefer-number-coercion": "warn",
    "unicorn/prefer-number-properties": "warn",
  },
});
