/**
 * Browser-side API client primitives.
 *
 * The UI talks to the application only over HTTP — it never imports a
 * service, a repository, or Prisma. This module turns the API's
 * `{ error: { code, message } }` envelope into a typed `ApiError` so
 * components can branch on the backend's error codes without parsing
 * response bodies themselves.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

/**
 * Performs the request and returns the parsed response body.
 * Throws {@link ApiError} for any non-2xx response.
 *
 * Shared by {@link requestJson} (envelopes with one named key) and
 * {@link requestJsonBody} (endpoints whose body *is* the result, with no
 * wrapping key) so both go through one fetch/error implementation.
 */
async function performJsonRequest(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    // fetch only rejects on network-level failure — the server is unreachable.
    throw new ApiError("The server is unreachable.", 0, "NETWORK_ERROR");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const envelope = (body ?? {}) as ErrorEnvelope;
    throw new ApiError(
      envelope.error?.message ?? "The request failed.",
      response.status,
      envelope.error?.code ?? "INTERNAL_ERROR",
    );
  }

  return body;
}

/**
 * Performs a JSON request and unwraps one key of the response envelope.
 * Throws {@link ApiError} for any non-2xx response.
 */
/**
 * Reads one named field from a successful response.
 *
 * A 2xx response that lacks `key` is a broken contract, not an empty
 * result, and it is reported as an error. This used to return
 * `body[key]` unchecked, so a response of the wrong shape resolved as a
 * *success* carrying `undefined` — and the view, believing it had data,
 * then threw while rendering. That turned a recoverable problem (show an
 * error, offer a retry, as every view already does) into a blank page. It
 * was found when a new panel's request was answered with another
 * endpoint's shape and took the whole project page down with it.
 *
 * `key in body` rather than `=== undefined`: several endpoints
 * legitimately answer `{ latest: null }` to mean "nothing assessed yet",
 * and that must still arrive as `null`.
 */
export async function requestJson<T>(
  path: string,
  key: string,
  init?: RequestInit,
): Promise<T> {
  const body = await performJsonRequest(path, init);
  if (body === null || typeof body !== "object" || !(key in body)) {
    throw new ApiError(
      `The server's response to ${path} did not include "${key}".`,
      502,
      "MALFORMED_RESPONSE",
    );
  }
  return (body as Record<string, T>)[key] as T;
}

/**
 * Performs a JSON request and returns the response body as-is.
 *
 * For the handful of endpoints — the graph's neighbor and traversal reads —
 * whose response body is the result itself rather than `{ key: result }`.
 */
export async function requestJsonBody<T>(path: string, init?: RequestInit): Promise<T> {
  return (await performJsonRequest(path, init)) as T;
}

/**
 * Maps an error to a message safe and useful to show a user.
 *
 * Validation and conflict messages come from the API because they describe
 * what the caller must change. Anything unexpected is replaced with a generic
 * line — internal failure text is never surfaced.
 */
export function describeApiError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Something went wrong. Please try again.";
  }

  switch (error.code) {
    case "VALIDATION_ERROR":
    case "CONFLICT":
      return error.message;
    // Authentication failures carry a deliberately non-enumerable message
    // ("Incorrect email address or password."), so passing it through tells
    // the user what to fix without revealing whether the account exists.
    case "UNAUTHORIZED":
      return error.message;
    case "FORBIDDEN":
      return "That request was blocked. Reload the page and try again.";
    case "NOT_FOUND":
      return "That project no longer exists, or you do not have access to it.";
    case "NETWORK_ERROR":
      return "Cannot reach the server. Check your connection and try again.";
    default:
      return "Something went wrong on the server. Please try again.";
  }
}
