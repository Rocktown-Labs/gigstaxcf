/**
 * Node-safe stub for the `cloudflare:workers` module.
 *
 * The real module only exists inside Cloudflare Workers, so vitest aliases the
 * bare module id to this file (see vitest.config.ts). Any import chain that
 * reaches `@/env.server` (for example `@/lib/db` -> `env.server`) then
 * resolves here instead of failing under Node. Runtime config reads work
 * because services access env values through the `serverEnv` proxy, which is
 * `process.env` in tests.
 */

export const { env } = process;

export class WorkflowEntrypoint {
  readonly env: Record<string, unknown> = process.env;
}

export interface WorkflowEvent<TPayload = unknown> {
  instanceId: string;
  payload: TPayload;
  timestamp: Date;
}

export interface WorkflowStep {
  do: <T>(name: string, callback: () => Promise<T> | T) => Promise<T>;
  sleep: (name: string, duration: number) => Promise<void>;
}
