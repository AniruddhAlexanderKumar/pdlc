/**
 * Standardized application error hierarchy.
 *
 * Route handlers and server actions should throw one of these (or a
 * domain-specific subclass built on top of `AppError`) instead of raw
 * `Error`s. A shared catch boundary can then read `statusCode`/`code` off
 * any caught error and call `toResponseBody()` to produce a safe, consistent
 * API error shape.
 *
 * Deliberately dependency-free (no import of `@/config/env`): error
 * primitives need to remain usable even if environment validation itself is
 * what failed, so production-mode detection here reads `process.env.NODE_ENV`
 * directly rather than the validated env module.
 */

export interface AppErrorOptions {
  /** HTTP status code this error maps to. Defaults to 500. */
  statusCode?: number;
  /** Stable machine-readable identifier, e.g. "VALIDATION_ERROR". */
  code?: string;
  /**
   * Whether this is an anticipated, handled failure (bad input, missing
   * resource, ...) as opposed to an unexpected programmer/runtime error.
   * Non-operational errors get their message replaced with a generic one
   * when serialized in production. Defaults to true.
   */
  isOperational?: boolean;
  /** Extra structured context (e.g. field-level validation issues). */
  details?: unknown;
}

export interface AppErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
}

/**
 * Base application error. Usable directly for an unexpected internal (500)
 * failure, and the parent class for the typed 4xx errors below.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly isOperational: boolean;
  readonly details?: unknown;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;

    // V8-specific; no-op (and harmless) on engines that lack it.
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Serializes this error into a JSON-safe API response body.
   *
   * - Stack traces are included only outside of production.
   * - Non-operational errors (unexpected/programmer errors) have their
   *   message and details replaced with a generic message in production,
   *   so internals never leak to a client.
   * - Operational errors (expected 4xx failures, e.g. ValidationError) keep
   *   their real message and details in every environment — that's the
   *   information the caller needs to fix their request.
   */
  toResponseBody(): AppErrorResponseBody {
    const isProduction = process.env.NODE_ENV === "production";
    const sanitize = isProduction && !this.isOperational;

    const error: AppErrorResponseBody["error"] = {
      code: sanitize ? "INTERNAL_ERROR" : this.code,
      message: sanitize ? "An unexpected error occurred. Please try again later." : this.message,
    };

    if (!sanitize && this.details !== undefined) {
      error.details = this.details;
    }
    if (!isProduction && this.stack) {
      error.stack = this.stack;
    }

    return { error };
  }
}

/** 400 — the request payload or parameters failed validation. */
export class ValidationError extends AppError {
  constructor(message = "The request payload failed validation.", details?: unknown) {
    super(message, { statusCode: 400, code: "VALIDATION_ERROR", isOperational: true, details });
  }
}

/** 401 — the caller could not be authenticated. */
export class UnauthorizedError extends AppError {
  constructor(
    message = "Authentication is required to access this resource.",
    details?: unknown,
  ) {
    super(message, { statusCode: 401, code: "UNAUTHORIZED", isOperational: true, details });
  }
}

/** 403 — the caller is authenticated but lacks permission. */
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.", details?: unknown) {
    super(message, { statusCode: 403, code: "FORBIDDEN", isOperational: true, details });
  }
}

/** 404 — the requested resource does not exist. */
export class NotFoundError extends AppError {
  constructor(message = "The requested resource could not be found.", details?: unknown) {
    super(message, { statusCode: 404, code: "NOT_FOUND", isOperational: true, details });
  }
}

/**
 * 409 — the request conflicts with existing state, e.g. an artifact
 * identifier that is already taken within the project.
 */
export class ConflictError extends AppError {
  constructor(message = "The request conflicts with the current state.", details?: unknown) {
    super(message, { statusCode: 409, code: "CONFLICT", isOperational: true, details });
  }
}

/** Type guard distinguishing our typed errors from arbitrary thrown values. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
