import {
  type CreateProjectInput,
  type Project,
  type ProjectStatus,
  type UpdateProjectInput,
  createProjectInputSchema,
  updateProjectInputSchema,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { NotFoundError } from "@/server/errors";
import { parseOrThrow } from "@/server/validation";
import { toProject } from "./mappers";
import { rethrowAsConflict } from "./prisma-error";

/**
 * Project data access.
 *
 * Repositories expose application-level operations and return domain
 * entities. Prisma query shapes stay inside this file so that callers — and
 * later, domain services — never depend on the ORM.
 *
 * Every function takes an optional `DbClient` so a service can run it inside
 * an interactive transaction alongside its audit event.
 *
 * Note the `undefined` vs `null` distinction on updates: omitting a field
 * leaves it untouched, passing `null` clears it. That is Prisma's semantics
 * and the domain update schemas mirror it deliberately.
 */

export async function createProject(
  input: CreateProjectInput,
  client: DbClient = prisma,
): Promise<Project> {
  const data = parseOrThrow(createProjectInputSchema, input, "Invalid project");

  try {
    const row = await client.project.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        description: data.description ?? null,
        status: data.status,
      },
    });
    return toProject(row);
  } catch (error) {
    rethrowAsConflict(error, `A project named "${data.name}" already exists in this organization.`);
  }
}

export async function getProjectById(id: string, client: DbClient = prisma): Promise<Project | null> {
  const row = await client.project.findUnique({ where: { id } });
  return row ? toProject(row) : null;
}

/** Same as {@link getProjectById}, but throws when the project is absent. */
export async function requireProjectById(id: string, client: DbClient = prisma): Promise<Project> {
  const project = await getProjectById(id, client);
  if (!project) {
    throw new NotFoundError(`Project ${id} was not found.`);
  }
  return project;
}

/**
 * Organization-scoped lookup — the only form services are allowed to use.
 *
 * Scoping the *query* rather than fetching by id and comparing afterwards is
 * what makes cross-tenant reads impossible by construction: a project in
 * another organization simply does not match.
 */
export async function findProjectInOrganization(
  organizationId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<Project | null> {
  const row = await client.project.findFirst({ where: { id: projectId, organizationId } });
  return row ? toProject(row) : null;
}

export async function listProjectsByOrganization(
  organizationId: string,
  options: { status?: ProjectStatus } = {},
  client: DbClient = prisma,
): Promise<Project[]> {
  const rows = await client.project.findMany({
    where: { organizationId, status: options.status },
    // Deterministic: newest first, with id breaking ties between projects
    // created in the same millisecond.
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(toProject);
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
  client: DbClient = prisma,
): Promise<Project> {
  const data = parseOrThrow(updateProjectInputSchema, input, "Invalid project update");

  try {
    const row = await client.project.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        status: data.status,
      },
    });
    return toProject(row);
  } catch (error) {
    rethrowAsConflict(error, "A project with that name already exists in this organization.");
  }
}

/** Archiving is the supported alternative to deletion — history is preserved. */
export async function archiveProject(id: string, client: DbClient = prisma): Promise<Project> {
  return updateProject(id, { status: "ARCHIVED" }, client);
}
