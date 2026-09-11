import type { BaselineStatus, EngineeringBaseline } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { rethrowAsConflict } from "./prisma-error";

/**
 * Engineering baseline data access. Project-scoped throughout.
 *
 * Owns the `engineering_baselines` table and nothing else. Membership has its
 * own repository, because a member is an immutable snapshot with its own rules
 * and folding it in here would put "what did we approve" and "what does the
 * baseline record say about it" behind one interface.
 *
 * There is no delete. A baseline is an engineering reference point that drift
 * assessments were computed against; removing one would orphan history, and the
 * database refuses it anyway through the RESTRICT on `drift_assessments`.
 */

export interface CreateBaselineData {
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  createdById: string | null;
}

export async function createBaseline(
  data: CreateBaselineData,
  client: DbClient = prisma,
): Promise<EngineeringBaseline> {
  try {
    return await client.engineeringBaseline.create({ data });
  } catch (error) {
    rethrowAsConflict(error, `Baseline ${data.identifier} already exists in this project.`);
  }
}

export async function findBaselineInProject(
  projectId: string,
  baselineId: string,
  client: DbClient = prisma,
): Promise<EngineeringBaseline | null> {
  return client.engineeringBaseline.findFirst({ where: { id: baselineId, projectId } });
}

export interface BaselineWithCounts extends EngineeringBaseline {
  memberCount: number;
  assessmentCount: number;
}

/**
 * Baselines newest first, with real aggregate counts.
 *
 * The counts come from a correlated subquery in the same statement, so listing
 * N baselines is one round trip rather than N+1.
 */
export async function listBaselinesInProject(
  projectId: string,
  options: { status?: BaselineStatus } = {},
  client: DbClient = prisma,
): Promise<BaselineWithCounts[]> {
  const rows = await client.engineeringBaseline.findMany({
    where: { projectId, status: options.status },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { _count: { select: { members: true, assessments: true } } },
  });

  return rows.map(({ _count, ...baseline }) => ({
    ...baseline,
    memberCount: _count.members,
    assessmentCount: _count.assessments,
  }));
}

/**
 * The project's currently active baseline, if it has one.
 *
 * At most one baseline is ACTIVE per project at a time; activation refuses to
 * proceed otherwise rather than silently replacing what is there.
 */
export async function findActiveBaseline(
  projectId: string,
  client: DbClient = prisma,
): Promise<EngineeringBaseline | null> {
  return client.engineeringBaseline.findFirst({
    where: { projectId, status: "ACTIVE" },
    orderBy: [{ baselinedAt: "desc" }, { id: "desc" }],
  });
}

export interface UpdateBaselineData {
  name?: string | undefined;
  description?: string | null | undefined;
}

/**
 * Edits a baseline's descriptive fields.
 *
 * The status is not updatable here: activation and supersession are their own
 * operations so each audits as its own event and neither can happen as a side
 * effect of an ordinary edit.
 */
export async function updateBaseline(
  id: string,
  data: UpdateBaselineData,
  client: DbClient = prisma,
): Promise<EngineeringBaseline> {
  return client.engineeringBaseline.update({ where: { id }, data });
}

/** Records activation: the moment the basis was fixed, and by whom. */
export async function activateBaseline(
  id: string,
  baselinedById: string | null,
  client: DbClient = prisma,
): Promise<EngineeringBaseline> {
  return client.engineeringBaseline.update({
    where: { id },
    data: { status: "ACTIVE", baselinedAt: new Date(), baselinedById },
  });
}

/**
 * Records supersession.
 *
 * `supersededById` points at the baseline that replaced this one where there is
 * one, so the succession is traversable rather than implied by dates.
 */
export async function supersedeBaseline(
  id: string,
  supersededById: string | null,
  client: DbClient = prisma,
): Promise<EngineeringBaseline> {
  return client.engineeringBaseline.update({
    where: { id },
    data: { status: "SUPERSEDED", supersededAt: new Date(), supersededById },
  });
}
