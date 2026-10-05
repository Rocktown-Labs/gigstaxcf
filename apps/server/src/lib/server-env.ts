/**
 * Typed accessor for server environment values.
 *
 * `@cloudflare/workers-types` declares `process` as `any`, so reading
 * `process.env.X` directly loses type safety. Workers populates
 * `process.env` from bindings under `nodejs_compat`, so this is a pure
 * typing wrapper over the same values.
 */
export const serverEnv: Record<string, string | undefined> = process.env;
