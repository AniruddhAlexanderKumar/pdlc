import { errorResponse, jsonResponse } from "@/server/api/response";
import { clearSessionCookie, readSessionCookie } from "@/server/auth/cookies";
import * as authService from "@/server/services/auth.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/sign-out
 *
 * Deletes the session row *and* clears the cookie. Server-side invalidation
 * is the part that matters: a token whose row is gone is dead even if a copy
 * of the cookie survives somewhere.
 *
 * POST because it changes state; succeeds regardless of whether a valid
 * session was present.
 */
export async function POST() {
  try {
    const token = await readSessionCookie();
    await authService.signOut(token);
    await clearSessionCookie();

    return jsonResponse({ signedOut: true });
  } catch (error) {
    return errorResponse(error);
  }
}
