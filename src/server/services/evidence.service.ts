import {
  type Evidence,
  type EvidenceCitingFinding,
  type EvidenceLinkSummary,
  type EvidenceStatus,
  allowedEvidenceTransitions,
  areEvidenceLinksEditable,
  canTransitionEvidence,
  createEvidenceRequestSchema,
  entityIdSchema,
  evidenceLinkRequestSchema,
  evidenceStatusSchema,
  evidenceTypeSchema,
  isEvidenceContentEditable,
  parseEvidenceLinkKey,
  supersedeEvidenceRequestSchema,
  updateEvidenceRequestSchema,
  validateEvidenceRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { AuditEventSummary } from "@/server/repositories/audit-log.repository";
import * as evidenceRepository from "@/server/repositories/evidence.repository";
import type { EvidenceActorSummary, EvidenceListItem } from "@/server/repositories/evidence.repository";
import * as projectArtifactsRepository from "@/server/repositories/project-artifacts.repository";
import { parseOrThrow } from "@/server/validation";
import { requireProjectInOrganization } from "./project-scope";

/**
 * Evidence application service.
 *
 * Everything an engineer can do to a piece of evidence passes through here,
 * and the same three rules `risk.service.ts` holds apply:
 *
 *  - **Tenancy.** The organization comes from the session and the project
 *    must belong to it. Evidence in someone else's project reads as "not
 *    found", never "forbidden".
 *  - **Lifecycle.** Status changes only through {@link validateEvidence} and
 *    {@link supersedeEvidence}, each validated against the domain's
 *    transition table. A generic update can never move evidence through its
 *    lifecycle, and once `VALIDATED` its content is frozen.
 *  - **Auditability.** Each mutation writes its audit event in the same
 *    transaction, attributed to the authenticated actor. Reads write nothing.
 *
 * There is no owner to assign here, unlike Risk/Issue: `recordedById` is
 * provenance set once at creation from the authenticated actor, never a
 * field a later caller reassigns.
 */

export const EVIDENCE_ENTITY_TYPE = "Evidence";

export const EVIDENCE_AUDIT_ACTIONS = {
  created: "evidence.created",
  updated: "evidence.updated",
  validated: "evidence.validated",
  superseded: "evidence.superseded",
  linkAdded: "evidence.link_added",
  linkRemoved: "evidence.link_removed",
} as const;

/** Evidence plus the parts the UI needs but the table does not hold. */
export interface EvidenceDetail extends Evidence {
  recordedBy: EvidenceActorSummary | null;
  validatedBy: EvidenceActorSummary | null;
  supersededByRef: { id: string; identifier: string; title: string } | null;
  links: EvidenceLinkSummary[];
  /** Certification findings that cite this evidence — read-only; see the repository doc comment. */
  citingFindings: EvidenceCitingFinding[];
  availableTransitions: readonly EvidenceStatus[];
  editable: { content: boolean; links: boolean };
  history: AuditEventSummary[];
}

const requireProject = requireProjectInOrganization;

async function requireEvidence(
  projectId: string,
  evidenceId: unknown,
  client?: Parameters<typeof evidenceRepository.findEvidenceInProject>[2],
): Promise<Evidence> {
  const id = parseOrThrow(entityIdSchema, evidenceId, "Invalid evidence id");
  const evidence = await evidenceRepository.findEvidenceInProject(projectId, id, client);

  if (!evidence) {
    throw new NotFoundError(`Evidence ${id} was not found.`);
  }
  return evidence;
}

function auditEvent(
  context: OrganizationContext,
  action: string,
  evidenceId: string,
  metadata: Record<string, unknown>,
) {
  return {
    organizationId: context.organizationId,
    actorId: context.actorId,
    action,
    entityType: EVIDENCE_ENTITY_TYPE,
    entityId: evidenceId,
    metadata,
  };
}

export async function createEvidence(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<Evidence> {
  const scopedProjectId = await requireProject(context, projectId);
  const data = parseOrThrow(createEvidenceRequestSchema, input, "Invalid evidence");

  return prisma.$transaction(async (tx) => {
    const evidence = await evidenceRepository.createEvidence(
      {
        projectId: scopedProjectId,
        identifier: data.identifier,
        title: data.title,
        description: data.description ?? null,
        evidenceType: data.evidenceType,
        sourceReference: data.sourceReference,
        // Provenance, not a client-supplied field: whoever is authenticated
        // right now is who recorded it.
        recordedById: context.actorId,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, EVIDENCE_AUDIT_ACTIONS.created, evidence.id, {
        identifier: evidence.identifier,
        projectId: scopedProjectId,
      }),
      tx,
    );

    return evidence;
  });
}

export async function listEvidence(
  context: OrganizationContext,
  projectId: unknown,
  filter: { status?: unknown; evidenceType?: unknown } = {},
): Promise<EvidenceListItem[]> {
  const scopedProjectId = await requireProject(context, projectId);

  const status =
    filter.status === undefined || filter.status === null || filter.status === ""
      ? undefined
      : parseOrThrow(evidenceStatusSchema, filter.status, "Invalid status filter");
  const evidenceType =
    filter.evidenceType === undefined || filter.evidenceType === null || filter.evidenceType === ""
      ? undefined
      : parseOrThrow(evidenceTypeSchema, filter.evidenceType, "Invalid evidence type filter");

  return evidenceRepository.listEvidenceInProject(scopedProjectId, { status, evidenceType });
}

/** Full detail: the evidence, its recorder/validator/successor, links, citing findings, legal transitions and history. */
export async function getEvidence(
  context: OrganizationContext,
  projectId: unknown,
  evidenceId: unknown,
): Promise<EvidenceDetail> {
  const scopedProjectId = await requireProject(context, projectId);
  const id = parseOrThrow(entityIdSchema, evidenceId, "Invalid evidence id");

  const detail = await evidenceRepository.findEvidenceDetail(scopedProjectId, id);
  if (!detail) {
    throw new NotFoundError(`Evidence ${id} was not found.`);
  }

  const [links, citingFindings, history] = await Promise.all([
    evidenceRepository.listEvidenceLinks(detail.id),
    evidenceRepository.listFindingsCitingEvidence(detail.id),
    auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: EVIDENCE_ENTITY_TYPE,
      entityId: detail.id,
    }),
  ]);

  return {
    ...detail,
    links,
    citingFindings,
    availableTransitions: allowedEvidenceTransitions(detail.status),
    editable: {
      content: isEvidenceContentEditable(detail.status),
      links: areEvidenceLinksEditable(detail.status),
    },
    history,
  };
}

/** Content update. Refuses once the evidence is no longer DRAFT. */
export async function updateEvidence(
  context: OrganizationContext,
  projectId: unknown,
  evidenceId: unknown,
  input: unknown,
): Promise<Evidence> {
  const scopedProjectId = await requireProject(context, projectId);
  const data = parseOrThrow(updateEvidenceRequestSchema, input, "Invalid evidence update");

  return prisma.$transaction(async (tx) => {
    const existing = await requireEvidence(scopedProjectId, evidenceId, tx);

    if (!isEvidenceContentEditable(existing.status)) {
      throw new ConflictError(
        `Evidence that is ${existing.status} is read-only and its content cannot be changed.`,
      );
    }

    const evidence = await evidenceRepository.updateEvidence(
      existing.id,
      {
        title: data.title,
        description: data.description,
        evidenceType: data.evidenceType,
        sourceReference: data.sourceReference,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, EVIDENCE_AUDIT_ACTIONS.updated, evidence.id, {
        changedFields: Object.keys(data),
      }),
      tx,
    );

    return evidence;
  });
}

/** DRAFT -> VALIDATED. The only path by which evidence is asserted sound. */
export async function validateEvidence(
  context: OrganizationContext,
  projectId: unknown,
  evidenceId: unknown,
  input: unknown,
): Promise<Evidence> {
  const scopedProjectId = await requireProject(context, projectId);
  const { rationale } = parseOrThrow(validateEvidenceRequestSchema, input ?? {}, "Invalid validation request");

  // Validating asserts a fact is sound; that assertion must be attributable
  // to a real, authenticated actor, not a system context.
  const actorId = context.actorId;
  if (!actorId) {
    throw new ValidationError("Evidence can only be validated by an authenticated actor.");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await requireEvidence(scopedProjectId, evidenceId, tx);

    if (!canTransitionEvidence(existing.status, "VALIDATED")) {
      throw new ConflictError(
        existing.status === "VALIDATED"
          ? "This evidence is already VALIDATED."
          : `Evidence that is ${existing.status} cannot be validated.`,
      );
    }

    const evidence = await evidenceRepository.validateEvidence(existing.id, actorId, tx);

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, EVIDENCE_AUDIT_ACTIONS.validated, evidence.id, {
        ...(rationale ? { rationale } : {}),
      }),
      tx,
    );

    return evidence;
  });
}

/**
 * DRAFT|VALIDATED -> SUPERSEDED. The replacement must already exist as its
 * own real evidence record in the same project — supersession records a
 * succession, it never creates evidence on the caller's behalf.
 *
 * No `EvidenceLink` row is touched: every historical relationship keeps
 * pointing at exactly the evidence version it was made against.
 */
export async function supersedeEvidence(
  context: OrganizationContext,
  projectId: unknown,
  evidenceId: unknown,
  input: unknown,
): Promise<Evidence> {
  const scopedProjectId = await requireProject(context, projectId);
  const { newEvidenceId, rationale } = parseOrThrow(
    supersedeEvidenceRequestSchema,
    input,
    "Invalid supersession request",
  );

  return prisma.$transaction(async (tx) => {
    const existing = await requireEvidence(scopedProjectId, evidenceId, tx);

    if (newEvidenceId === existing.id) {
      throw new ValidationError("Evidence cannot supersede itself.");
    }

    if (!canTransitionEvidence(existing.status, "SUPERSEDED")) {
      throw new ConflictError(`Evidence that is ${existing.status} cannot be superseded.`);
    }

    const replacement = await requireEvidence(scopedProjectId, newEvidenceId, tx);
    if (replacement.status === "SUPERSEDED") {
      throw new ValidationError(
        "The replacement evidence is itself SUPERSEDED and cannot be named as a successor.",
      );
    }

    const evidence = await evidenceRepository.supersedeEvidence(existing.id, replacement.id, tx);

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, EVIDENCE_AUDIT_ACTIONS.superseded, evidence.id, {
        supersededById: replacement.id,
        ...(rationale ? { rationale } : {}),
      }),
      tx,
    );

    return evidence;
  });
}

export async function listEvidenceLinks(
  context: OrganizationContext,
  projectId: unknown,
  evidenceId: unknown,
): Promise<EvidenceLinkSummary[]> {
  const scopedProjectId = await requireProject(context, projectId);
  const evidence = await requireEvidence(scopedProjectId, evidenceId);
  return evidenceRepository.listEvidenceLinks(evidence.id);
}

/**
 * Adds one trace edge.
 *
 * The target must exist *in the same project*, which is checked against the
 * target's own table (or, for a compliance item, its basis/programme chain)
 * with the project in the query — so a link to another project's artifact is
 * rejected rather than silently written.
 */
export async function linkEvidence(
  context: OrganizationContext,
  projectId: unknown,
  evidenceId: unknown,
  input: unknown,
): Promise<EvidenceLinkSummary> {
  const scopedProjectId = await requireProject(context, projectId);
  const request = parseOrThrow(evidenceLinkRequestSchema, input, "Invalid traceability link");

  return prisma.$transaction(async (tx) => {
    const evidence = await requireEvidence(scopedProjectId, evidenceId, tx);

    if (!areEvidenceLinksEditable(evidence.status)) {
      throw new ConflictError(
        `Evidence that is ${evidence.status} is read-only and its traceability cannot be changed.`,
      );
    }

    const targetInProject = await evidenceRepository.evidenceLinkTargetExistsInProject(
      request.relation,
      request.targetId,
      scopedProjectId,
      tx,
    );
    if (!targetInProject) {
      throw new ValidationError(
        "That target does not exist in this project. Evidence can only be linked to artifacts in the same project.",
      );
    }

    const already = await evidenceRepository.evidenceLinkExists(
      evidence.id,
      request.relation,
      request.targetId,
      tx,
    );
    if (already) {
      throw new ValidationError("That link already exists on this evidence.");
    }

    await evidenceRepository.createEvidenceLink(
      {
        evidenceId: evidence.id,
        relation: request.relation,
        targetId: request.targetId,
        note: request.note ?? null,
        createdById: context.actorId,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, EVIDENCE_AUDIT_ACTIONS.linkAdded, evidence.id, {
        relation: request.relation,
        targetId: request.targetId,
      }),
      tx,
    );

    const links = await evidenceRepository.listEvidenceLinks(evidence.id, tx);
    const created = links.find(
      (link) => link.relation === request.relation && link.targetId === request.targetId,
    );
    if (!created) {
      throw new ValidationError("The link could not be read back after creation.");
    }
    return created;
  });
}

export async function unlinkEvidence(
  context: OrganizationContext,
  projectId: unknown,
  evidenceId: unknown,
  linkId: unknown,
): Promise<void> {
  const scopedProjectId = await requireProject(context, projectId);
  const key = typeof linkId === "string" ? parseEvidenceLinkKey(linkId) : null;
  if (!key) {
    throw new ValidationError("Invalid evidence link id.");
  }

  await prisma.$transaction(async (tx) => {
    const evidence = await requireEvidence(scopedProjectId, evidenceId, tx);

    if (!areEvidenceLinksEditable(evidence.status)) {
      throw new ConflictError(
        `Evidence that is ${evidence.status} is read-only and its traceability cannot be changed.`,
      );
    }

    const removed = await evidenceRepository.deleteEvidenceLink(evidence.id, key.rowId, tx);
    if (removed === 0) {
      throw new NotFoundError("That traceability link does not exist.");
    }

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, EVIDENCE_AUDIT_ACTIONS.linkRemoved, evidence.id, { relation: key.relation }),
      tx,
    );
  });
}

/** Artifacts in the project that evidence may be linked to — powers the selectors. */
export async function listLinkTargets(
  context: OrganizationContext,
  projectId: unknown,
): Promise<projectArtifactsRepository.EvidenceLinkTargetOptions> {
  const scopedProjectId = await requireProject(context, projectId);
  return projectArtifactsRepository.listEvidenceLinkTargets(scopedProjectId);
}
