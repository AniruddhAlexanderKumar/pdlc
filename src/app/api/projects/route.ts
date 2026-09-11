import { errorResponse, jsonResponse, readJsonBody } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as projectService from "@/server/services/project.service";

// Reads the database per request; never statically evaluated at build time.
export const dynamic = "force-dynamic";

/** GET /api/projects — projects in the caller's organization, newest first. */
export async function GET() {
  try {
    const context = await requireAuthenticatedContext();
    const projects = await projectService.listProjects(context);
    return jsonResponse({ projects });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/projects — create a project in the caller's organization. */
export async function POST(request: Request) {
  try {
    const context = await requireAuthenticatedContext();
    const body = await readJsonBody(request);
    const project = await projectService.createProject(context, body);
    return jsonResponse({ project }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
