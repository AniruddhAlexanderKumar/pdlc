import type {
  ObservationStatus,
  ObservationSubject,
  ObservationSubjectType,
  ObservationType,
  OperationalObservation,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { rethrowAsConflict } from "./prisma-error";

/**
 * Operational observation data access. Project-scoped throughout.
 *
 * The numeric value is a PostgreSQL NUMERIC read back as an exact decimal
 * *string*, never a JavaScript number. This system exists to say whether two
 * values differ, so a float round-trip that turns 0.1 into 0.09999999999999999
 * would be a defect in the one thing it is for.
 *
 * There is no delete. A rejected observation is kept: that somebody reported it,
 * and that an engineer rejected it, is part of the operational history.
 */

const OBSERVATION_SELECT = {
  id: true,
  projectId: true,
  identifier: true,
  title: true,
  description: true,
  observationType: true,
  status: true,
  source: true,
  observedAt: true,
  subjectLabel: true,
  numericValue: true,
  unit: true,
  textValue: true,
  createdById: true,
  reviewedAt: true,
  reviewedById: true,
  createdAt: true,
  updatedAt: true,
  designItemId: true,
  decisionExpectationId: true,
  suppliedItemId: true,
} as const;

interface ObservationRow {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  observationType: ObservationType;
  status: ObservationStatus;
  source: string | null;
  observedAt: Date;
  subjectLabel: string | null;
  numericValue: { toString(): string } | null;
  unit: string | null;
  textValue: string | null;
  createdById: string | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  designItemId: string | null;
  decisionExpectationId: string | null;
  suppliedItemId: string | null;
}

/** Collapses the three nullable subject columns into the domain's tagged pair. */
function toSubject(row: ObservationRow): ObservationSubject | null {
  if (row.designItemId) return { type: "DESIGN_ITEM", id: row.designItemId };
  if (row.decisionExpectationId) {
    return { type: "DECISION_EXPECTATION", id: row.decisionExpectationId };
  }
  if (row.suppliedItemId) return { type: "SUPPLIED_ITEM", id: row.suppliedItemId };
  // A CHECK constraint allows at most one, and none is legitimate: a field
  // report that does not yet name what it concerns is still a real record.
  return null;
}

function toObservation(row: ObservationRow): OperationalObservation {
  return {
    id: row.id,
    projectId: row.projectId,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    observationType: row.observationType,
    status: row.status,
    source: row.source,
    observedAt: row.observedAt,
    subjectLabel: row.subjectLabel,
    // Prisma's Decimal stringifies exactly; never coerced through a float.
    numericValue: row.numericValue === null ? null : row.numericValue.toString(),
    unit: row.unit,
    textValue: row.textValue,
    subject: toSubject(row),
    createdById: row.createdById,
    reviewedAt: row.reviewedAt,
    reviewedById: row.reviewedById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Maps the domain's tagged subject onto the one foreign key column that holds it. */
function subjectColumns(subject: ObservationSubject | null): Record<string, string | null> {
  return {
    designItemId: subject?.type === "DESIGN_ITEM" ? subject.id : null,
    decisionExpectationId: subject?.type === "DECISION_EXPECTATION" ? subject.id : null,
    suppliedItemId: subject?.type === "SUPPLIED_ITEM" ? subject.id : null,
  };
}

export interface CreateObservationData {
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  observationType: ObservationType;
  source: string | null;
  observedAt: Date;
  subjectLabel: string | null;
  /** Exact decimal text; handed to NUMERIC unparsed. */
  numericValue: string | null;
  unit: string | null;
  textValue: string | null;
  subject: ObservationSubject | null;
  createdById: string | null;
}

export async function createObservation(
  data: CreateObservationData,
  client: DbClient = prisma,
): Promise<OperationalObservation> {
  try {
    const row = await client.operationalObservation.create({
      data: {
        projectId: data.projectId,
        identifier: data.identifier,
        title: data.title,
        description: data.description,
        observationType: data.observationType,
        source: data.source,
        observedAt: data.observedAt,
        subjectLabel: data.subjectLabel,
        numericValue: data.numericValue,
        unit: data.unit,
        textValue: data.textValue,
        createdById: data.createdById,
        ...subjectColumns(data.subject),
      },
      select: OBSERVATION_SELECT,
    });
    return toObservation(row);
  } catch (error) {
    rethrowAsConflict(error, `Observation ${data.identifier} already exists in this project.`);
  }
}

export async function findObservationInProject(
  projectId: string,
  observationId: string,
  client: DbClient = prisma,
): Promise<OperationalObservation | null> {
  const row = await client.operationalObservation.findFirst({
    where: { id: observationId, projectId },
    select: OBSERVATION_SELECT,
  });
  return row ? toObservation(row) : null;
}

export async function listObservationsInProject(
  projectId: string,
  options: {
    status?: ObservationStatus;
    observationType?: ObservationType;
    subjectType?: ObservationSubjectType;
    subjectId?: string;
  } = {},
  client: DbClient = prisma,
): Promise<OperationalObservation[]> {
  const subjectFilter =
    options.subjectType && options.subjectId
      ? subjectColumnFilter(options.subjectType, options.subjectId)
      : {};

  const rows = await client.operationalObservation.findMany({
    where: {
      projectId,
      status: options.status,
      observationType: options.observationType,
      ...subjectFilter,
    },
    // Newest observation first, with the id breaking ties so two records made in
    // the same millisecond never depend on database row order.
    orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    select: OBSERVATION_SELECT,
  });
  return rows.map(toObservation);
}

function subjectColumnFilter(
  subjectType: ObservationSubjectType,
  subjectId: string,
): Record<string, string> {
  switch (subjectType) {
    case "DESIGN_ITEM":
      return { designItemId: subjectId };
    case "DECISION_EXPECTATION":
      return { decisionExpectationId: subjectId };
    case "SUPPLIED_ITEM":
      return { suppliedItemId: subjectId };
  }
}

/**
 * Observations that a drift evaluation should consider, in one query.
 *
 * Every observation in the project is loaded — the evaluation needs the
 * unreviewed ones too, so it can report honestly that they exist rather than
 * letting silence imply it looked at everything.
 */
export async function listObservationsForEvaluation(
  projectId: string,
  client: DbClient = prisma,
): Promise<OperationalObservation[]> {
  const rows = await client.operationalObservation.findMany({
    where: { projectId },
    orderBy: [{ observedAt: "asc" }, { id: "asc" }],
    select: OBSERVATION_SELECT,
  });
  return rows.map(toObservation);
}

export interface UpdateObservationData {
  title?: string | undefined;
  description?: string | undefined;
  observationType?: ObservationType | undefined;
  source?: string | null | undefined;
  observedAt?: Date | undefined;
  subjectLabel?: string | null | undefined;
  numericValue?: string | null | undefined;
  unit?: string | null | undefined;
  textValue?: string | null | undefined;
}

/**
 * Edits the substance of an observation.
 *
 * The subject is not updatable: re-pointing an observation at a different object
 * would change what it asserts rather than correct it. The status is not
 * updatable either — review and rejection are their own operations.
 */
export async function updateObservation(
  id: string,
  data: UpdateObservationData,
  client: DbClient = prisma,
): Promise<OperationalObservation> {
  const row = await client.operationalObservation.update({
    where: { id },
    data,
    select: OBSERVATION_SELECT,
  });
  return toObservation(row);
}

/** Records an engineer's determination. Terminal in both directions. */
export async function transitionObservation(
  id: string,
  status: Extract<ObservationStatus, "REVIEWED" | "REJECTED">,
  reviewedById: string | null,
  client: DbClient = prisma,
): Promise<OperationalObservation> {
  const row = await client.operationalObservation.update({
    where: { id },
    data: { status, reviewedAt: new Date(), reviewedById },
    select: OBSERVATION_SELECT,
  });
  return toObservation(row);
}

/** Whether an observation subject really exists inside this project. */
export async function observationSubjectExistsInProject(
  subjectType: ObservationSubjectType,
  subjectId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  switch (subjectType) {
    case "DESIGN_ITEM":
      return (
        (await client.designItem.findFirst({
          where: { id: subjectId, projectId },
          select: { id: true },
        })) !== null
      );
    case "DECISION_EXPECTATION":
      // An expectation reaches the project through its decision.
      return (
        (await client.decisionExpectation.findFirst({
          where: { id: subjectId, engineeringDecision: { projectId } },
          select: { id: true },
        })) !== null
      );
    case "SUPPLIED_ITEM":
      return (
        (await client.suppliedItem.findFirst({
          where: { id: subjectId, projectId },
          select: { id: true },
        })) !== null
      );
  }
}
