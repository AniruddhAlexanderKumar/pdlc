import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { setSessionCookie } from "@/server/auth/cookies";
import * as authService from "@/server/services/auth.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/sign-up
 *
 * Creates the organization, user, credential and first session atomically,
 * then signs the caller in — registration and authentication are one step, so
 * there is no window in which an account exists but cannot be used.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const { identity, session } = await authService.register(body);

    await setSessionCookie(session.token, session.expiresAt);

    return jsonResponse(identity, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
