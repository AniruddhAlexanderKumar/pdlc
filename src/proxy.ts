import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { logger } from "@/lib/logger";

// `crypto.randomUUID()` below is the Web Crypto API global — available in
// both runtimes Proxy can run in, so this needs no change now that Proxy
// defaults to the Node.js runtime (Next.js 16) rather than Edge.

/**
 * Proxy (formerly "Middleware", renamed by Next.js 16 — see
 * node_modules/next/dist/docs/.../proxy.md): three cheap, header-only
 * concerns. No database access, no crypto beyond generating an id, no
 * session validation — the authoritative
 * session check is always the server-side `requireAuthenticatedContext()` in
 * route handlers and the workspace layout.
 *
 * 1. **CSRF origin check.** Cookie-based auth means a cross-site form or
 *    fetch could otherwise ride along on the browser's cookie. `SameSite=Lax`
 *    already stops the cookie being sent on cross-site POSTs; this is the
 *    second layer. Applied centrally to every state-changing API request
 *    rather than restated in each route.
 *
 *    A request whose `Origin` disagrees with its `Host` is rejected. A request
 *    with no `Origin` at all is allowed: browsers always attach one to
 *    cross-site state-changing fetches, so its absence means the caller is not
 *    a cross-site browser context (curl, tests, server-to-server).
 *
 * 2. **Unauthenticated redirect.** Workspace pages requested without a session
 *    cookie redirect to /sign-in immediately, which avoids rendering a shell
 *    that the layout is about to reject. Presence of a cookie proves nothing —
 *    it only skips obvious work.
 *
 * 3. **Request correlation id.** Every request is stamped with a fresh
 *    server-generated id (never one supplied by the caller — an inbound
 *    `x-request-id` is meaningless as a security or dedup signal and trusting
 *    it would let a client inject arbitrary values into server logs). The id
 *    is logged once here alongside the method and path, forwarded to the
 *    route handler on the request so any handler that wants it can read
 *    `request.headers.get("x-request-id")`, and echoed back on the response
 *    so a support conversation can reference the exact request.
 */

const SESSION_COOKIE_NAME = "pdlc_session";
const REQUEST_ID_HEADER = "x-request-id";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Workspace route prefixes that require a session. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/projects",
  "/requirements",
  "/decisions",
  "/changes",
  "/traceability",
  "/verification",
  "/risks",
];

function isCrossOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const host = request.headers.get("host");
  if (!host) return true;

  try {
    return new URL(origin).host !== host;
  } catch {
    // An unparseable Origin is not something to give the benefit of the doubt.
    return true;
  }
}

/** Stamps `requestId` on the outgoing response. */
function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();

  // One line per request, not per log level someone might filter out later —
  // this is the audit trail that lets a request id reported by a user or
  // shown in an error response be found again in the server logs.
  logger.info("Request received", { requestId, method: request.method, path: pathname });

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(REQUEST_ID_HEADER, requestId);
  const forwardedRequest = { headers: forwardedHeaders };

  if (pathname.startsWith("/api/")) {
    if (STATE_CHANGING_METHODS.has(request.method) && isCrossOrigin(request)) {
      return withRequestId(
        NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Cross-origin request rejected." } },
          { status: 403 },
        ),
        requestId,
      );
    }
    return withRequestId(NextResponse.next({ request: forwardedRequest }), requestId);
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !request.cookies.get(SESSION_COOKIE_NAME)) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname);
    return withRequestId(NextResponse.redirect(signInUrl), requestId);
  }

  return withRequestId(NextResponse.next({ request: forwardedRequest }), requestId);
}

export const config = {
  // Skip Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
