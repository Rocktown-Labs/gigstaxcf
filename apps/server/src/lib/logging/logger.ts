/**
 * Minimal pino-compatible logger shim for Workers.
 *
 * gigstax services use the pino call signature `logger.info(fields, "msg")`.
 * Request-scoped structured logging on this stack flows through evlog →
 * Axiom (see src/index.ts); this shim covers the few service modules that
 * log outside a request context.
 */
type LogFields = Record<string, unknown>;

interface PinoLike {
  child: (bindings: LogFields) => PinoLike;
  debug: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

const emit =
  (level: string) =>
  (obj: unknown, msg?: string): void => {
    const fields: LogFields =
      typeof obj === "object" && obj !== null && !(obj instanceof Error)
        ? (obj as LogFields)
        : { value: obj };
    if (msg) {
      fields.msg = msg;
    }
    if (obj instanceof Error) {
      fields.error = obj.message;
      fields.stack = obj.stack;
    }
    const log = (
      console as unknown as Record<string, (...args: unknown[]) => void>
    )[level];
    log?.(JSON.stringify({ level, ...fields }));
  };

const base: PinoLike = {
  child: () => base,
  debug: emit("debug"),
  error: emit("error"),
  info: emit("info"),
  warn: emit("warn"),
};

export const logger = base;
