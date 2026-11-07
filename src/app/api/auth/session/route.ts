import { errorResponse, jsonResponse } from "@/server/api/response";
import { getAuthenticatedContext, toIdentity } from "@/server/auth/context";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/session
 *
 * Returns the current identity, or `{ identity: null }` when unauthenticated.
 * Deliberately 200 in both cases: "am I signed in?" is a question, not an
 * error, and the client uses it to decide what to render.
 *
 * Only the safe identity subset is serialized — never the session id, token
 * or credential state.
 */
export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    return jsonResponse({ identity: context ? toIdentity(context) : null });
  } catch (error) {
    return errorResponse(error);
  }
}
