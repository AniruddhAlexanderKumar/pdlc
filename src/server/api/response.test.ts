// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * `errorResponse` is the one place every route handler's catch block hands
 * off to — the boundary that decides what a client ever sees for a thrown
 * value. `AppError#toResponseBody` (tested in errors.test.ts) covers the
 * sanitization rule itself; what is missing there is proof that this
 * function actually reaches it for *every* kind of thrown value, including
 * ones nothing in this codebase defined — a raw Prisma error, a plain
 * `Error`, a string, `undefined` — and that it logs the real detail
 * server-side before ever discarding it.
 */

// `child()` must return the *same* object every call — response.ts calls it
// once at module load to build its own `log`, and this test needs a
// reference to those same spies, not a fresh, disconnected set.
vi.mock("@/lib/logger", () => {
  const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { logger: { child: () => log } };
});

const { errorResponse, jsonResponse, readJsonBody } = await import("./response");
const { logger } = await import("@/lib/logger");
const log = logger.child({ module: "api" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("errorResponse — known AppErrors", () => {
  it("keeps an operational AppError's real status, code and message", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = errorResponse(new NotFoundError("The requirement was not found."));
    const body = await response.json();

    expect(response.status).toBe(404);
    // Exact equality in production specifically: no stray `stack` field
    // should survive into what a client actually receives.
    expect(body).toEqual({
      error: { code: "NOT_FOUND", message: "The requirement was not found." },
    });
  });

  it("keeps validation field details for the client to act on", async () => {
    const response = errorResponse(
      new ValidationError("Invalid input", [{ path: "title", message: "Required" }]),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.details).toEqual([{ path: "title", message: "Required" }]);
  });
});

describe("errorResponse — anything not an AppError", () => {
  it("never returns a raw Prisma/driver error message to the client", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const dbError = new Error(
      "duplicate key value violates unique constraint \"requirements_projectId_identifier_key\" " +
        "at postgresql://pdlc_admin:s3cr3t@10.0.0.5:5432/pdlc",
    );

    const response = errorResponse(dbError);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(serialized).not.toMatch(/pdlc_admin|s3cr3t|10\.0\.0\.5|constraint|postgresql:/);
  });

  it("never returns a stack trace to the client in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = errorResponse(new Error("something exploded"));
    const body = await response.json();

    expect(body.error).not.toHaveProperty("stack");
  });

  it("handles a thrown non-Error value (string, undefined, object) the same safe way", async () => {
    vi.stubEnv("NODE_ENV", "production");

    for (const thrown of ["a plain string", undefined, { unexpected: "shape" }, 42]) {
      const response = errorResponse(thrown);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual({
        error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred. Please try again later." },
      });
    }
  });

  it("still logs the real error server-side even though the client never sees it", () => {
    const dbError = new Error("connection terminated unexpectedly");
    errorResponse(dbError);

    expect(log.error).toHaveBeenCalledWith(
      "Unhandled error in route handler",
      expect.objectContaining({ err: dbError }),
    );
  });

  it("logs a non-operational AppError too, not just genuinely unknown throws", () => {
    const internal = new AppError("cache warm-up failed", { isOperational: false });
    errorResponse(internal);

    expect(log.error).toHaveBeenCalledWith(
      "Unexpected application error",
      expect.objectContaining({ err: internal, code: "INTERNAL_ERROR" }),
    );
  });

  it("does not log an ordinary operational AppError as if it were unexpected", () => {
    errorResponse(new NotFoundError());

    expect(log.error).not.toHaveBeenCalled();
  });
});

describe("readJsonBody", () => {
  it("turns malformed JSON into a 400 ValidationError, not an unhandled parse failure", async () => {
    const request = new Request("http://localhost/api/x", {
      method: "POST",
      body: "{not valid json",
      headers: { "content-type": "application/json" },
    });

    await expect(readJsonBody(request)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("jsonResponse", () => {
  it("defaults to 200, and honors an explicit status", async () => {
    expect(jsonResponse({ ok: true }).status).toBe(200);
    expect(jsonResponse({ created: true }, 201).status).toBe(201);
  });
});
