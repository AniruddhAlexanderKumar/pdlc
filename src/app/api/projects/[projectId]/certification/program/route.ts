import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import { certificationProgramService } from "@/server/services/certification-program.service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** GET — the project's certification program, or null if none has been created yet. */
export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const program = await certificationProgramService.getProgram(context, projectId);
    return jsonResponse({ program });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — creates the project's (singular) certification program. Refused if one already exists. */
export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const program = await certificationProgramService.createProgram(context, projectId, body);
    return jsonResponse({ program }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH — updates the project's certification program (name, description, status, owner). */
export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { projectId } = await routeContext.params;
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const program = await certificationProgramService.updateProgram(context, projectId, body);
    return jsonResponse({ program });
  } catch (error) {
    return errorResponse(error);
  }
}
