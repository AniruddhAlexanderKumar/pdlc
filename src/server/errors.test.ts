import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  isAppError,
} from "@/server/errors";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AppError status/code matrix", () => {
  it.each([
    [ValidationError, 400, "VALIDATION_ERROR"],
    [UnauthorizedError, 401, "UNAUTHORIZED"],
    [ForbiddenError, 403, "FORBIDDEN"],
    [NotFoundError, 404, "NOT_FOUND"],
  ] as const)("%s maps to status %d and code %s", (ErrorClass, statusCode, code) => {
    const error = new ErrorClass();
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(statusCode);
    expect(error.code).toBe(code);
    expect(error.isOperational).toBe(true);
  });

  it("defaults AppError itself to a 500 internal error", () => {
    const error = new AppError("boom");
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.isOperational).toBe(true);
  });

  it("supports a non-operational AppError for unexpected failures", () => {
    const error = new AppError("db connection dropped", { isOperational: false });
    expect(error.isOperational).toBe(false);
  });
});

describe("isAppError", () => {
  it("returns true for AppError instances and subclasses", () => {
    expect(isAppError(new AppError("x"))).toBe(true);
    expect(isAppError(new NotFoundError())).toBe(true);
  });

  it("returns false for plain errors and non-error values", () => {
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError("not an error")).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});

describe("AppError#toResponseBody", () => {
  it("includes the real message and details for operational errors, even in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = new ValidationError("Invalid field", { field: "email" });

    const body = error.toResponseBody();

    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Invalid field");
    expect(body.error.details).toEqual({ field: "email" });
  });

  it("sanitizes message and hides details for non-operational errors in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = new AppError("Postgres connection string leaked in this message", {
      isOperational: false,
      details: { secret: "do-not-leak" },
    });

    const body = error.toResponseBody();

    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("An unexpected error occurred. Please try again later.");
    expect(body.error.details).toBeUndefined();
  });

  it("never includes a stack trace in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = new NotFoundError();
    expect(error.toResponseBody().error.stack).toBeUndefined();
  });

  it("includes a stack trace outside of production", () => {
    vi.stubEnv("NODE_ENV", "development");
    const error = new NotFoundError();
    expect(error.toResponseBody().error.stack).toBeDefined();
  });
});
