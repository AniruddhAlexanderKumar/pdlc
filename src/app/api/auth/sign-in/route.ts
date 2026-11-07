import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { setSessionCookie } from "@/server/auth/cookies";
import * as authService from "@/server/services/auth.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/sign-in
 *
 * Returns 401 with one generic message for every kind of authentication
 * failure, so responses cannot be used to enumerate accounts.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const { identity, session } = await authService.signIn(body);

    await setSessionCookie(session.token, session.expiresAt);

    return jsonResponse(identity);
  } catch (error) {
    return errorResponse(error);
  }
}
