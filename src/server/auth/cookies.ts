import { cookies } from "next/headers";
import { env } from "@/config/env";

/**
 * Session cookie handling. Server-only.
 *
 * The cookie carries the opaque session token and nothing else — no identity,
 * no claims, no signature to verify. Everything the application knows about
 * the caller comes from the database row that token points at.
 */

export const SESSION_COOKIE_NAME = "pdlc_session";

/**
 * - `httpOnly` keeps the token out of reach of any script, so an XSS bug
 *   cannot exfiltrate a session.
 * - `sameSite: "lax"` means the cookie is not attached to cross-site POSTs,
 *   which is the primary CSRF defence (see the origin check in middleware).
 * - `secure` everywhere except development, where localhost is plain HTTP.
 * - `path: "/"` so the whole application sees it.
 */
function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, cookieOptions(expiresAt));
}

export async function readSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  // Overwrite with an already-expired empty cookie rather than only deleting,
  // so the browser drops it even if the delete is ignored.
  store.set(SESSION_COOKIE_NAME, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}
