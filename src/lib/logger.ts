import { env } from "@/config/env";

/**
 * Lightweight structured logger.
 *
 * No transport, no dependency, no buffering — just `console.*` under the
 * hood, which every hosting platform and terminal already knows how to
 * capture. In production it prints one JSON object per line (easy to ingest
 * into any log pipeline); in development it prints a readable, colorless
 * line for fast scanning in a terminal.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// This module is the sanctioned console boundary — `no-console` explicitly
// allows all four methods used here (see eslint.config.mjs).
const CONSOLE_METHOD: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

/** Converts Error values inside a context object into plain, loggable fields. */
function normalizeContext(context: LogContext | undefined): LogContext | undefined {
  if (!context) return context;

  const normalized: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    normalized[key] =
      value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack }
        : value;
  }
  return normalized;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[env.LOG_LEVEL];
}

function emit(level: LogLevel, message: string, context: LogContext | undefined): void {
  if (!shouldLog(level)) return;

  const timestamp = new Date().toISOString();
  const normalized = normalizeContext(context);
  const write = CONSOLE_METHOD[level];

  if (env.NODE_ENV === "production") {
    write(JSON.stringify({ timestamp, level, message, ...normalized }));
    return;
  }

  const prefix = `${timestamp} ${level.toUpperCase().padEnd(5)}`;
  if (normalized && Object.keys(normalized).length > 0) {
    write(prefix, message, normalized);
  } else {
    write(prefix, message);
  }
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Returns a logger that merges `bindings` into every subsequent call's context. */
  child(bindings: LogContext): Logger;
}

function createLogger(bindings: LogContext = {}): Logger {
  return {
    debug: (message, context) => emit("debug", message, { ...bindings, ...context }),
    info: (message, context) => emit("info", message, { ...bindings, ...context }),
    warn: (message, context) => emit("warn", message, { ...bindings, ...context }),
    error: (message, context) => emit("error", message, { ...bindings, ...context }),
    child: (childBindings) => createLogger({ ...bindings, ...childBindings }),
  };
}

/** Application-wide logger instance. Use `logger.child({ module: "..." })` for scoped context. */
export const logger: Logger = createLogger();
