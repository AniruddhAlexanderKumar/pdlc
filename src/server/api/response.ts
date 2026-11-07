import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { AppError, ValidationError, isAppError } from "@/server/errors";

/**
 * HTTP translation for route handlers.
 *
 * Route handlers stay thin: read input, call a service, hand whatever comes
 * back to these helpers. Status codes come from the error hierarchy
 * (`AppError.statusCode`) rather than being restated at each call site, so a
 * new error type is mapped once, here.
 */

const log = logger.child({ module: "api" });

/** Successful JSON response. Pass 201 for creation. */
export function jsonResponse<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

/**
 * Converts a thrown value into a response.
 *
 * Known application errors keep their status and message. Anything else is an
 * unexpected failure: it is logged in full server-side and reported to the
 * client as a generic 500 — `AppError.toResponseBody()` already strips
 * internals in production.
 */
export function errorResponse(error: unknown): NextResponse {
  if (isAppError(error)) {
    if (!error.isOperational) {
      log.error("Unexpected application error", { err: error, code: error.code });
    }
    return NextResponse.json(error.toResponseBody(), { status: error.statusCode });
  }

  log.error("Unhandled error in route handler", { err: error });

  const internal = new AppError("An unexpected error occurred.", { isOperational: false });
  return NextResponse.json(internal.toResponseBody(), { status: internal.statusCode });
}

/**
 * Reads a JSON request body, turning malformed JSON into a 400 rather than an
 * unhandled parse failure.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}
