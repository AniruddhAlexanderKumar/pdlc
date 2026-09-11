import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge middleware: two cheap, header-only checks. No database access, no
 * crypto, no session validation — the authoritative session check is always
 * the server-side `requireAuthenticatedContext()` in route handlers and the
 * workspace layout.
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
 */

const SESSION_COOKIE_NAME = "pdlc_session";

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (STATE_CHANGING_METHODS.has(request.method) && isCrossOrigin(request)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Cross-origin request rejected." } },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !request.cookies.get(SESSION_COOKIE_NAME)) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
