import type { Requirement, VerificationActivity } from "@/domain";
import { identifierPrefix, nextIdentifier, type NumberedRecordKind } from "@/domain/shared/auto-identifier";
import {
  areLinksEditable,
  checkTitleFor,
  createRequirementsInBulkRequestSchema,
  deriveRequirementTitle,
  planChecksRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as recordIdentifierRepository from "@/server/repositories/record-identifier.repository";
import * as requirementRepository from "@/server/repositories/requirement.repository";
import type { RequirementCheckCandidate } from "@/server/repositories/requirement.repository";
import * as verificationRepository from "@/server/repositories/verification-activity.repository";
import { parseOrThrow } from "@/server/validation";
import {
  artifactAuditEvent,
  requireProjectReadAccess,
  requireProjectWriteAccess,
} from "./project-scope";
import { REQUIREMENT_AUDIT_ACTIONS, REQUIREMENT_ENTITY_TYPE } from "./requirement.service";
import { VERIFICATION_AUDIT_ACTIONS, VERIFICATION_ENTITY_TYPE } from "./verification-activity.service";

/**
 * The two automations in `@/domain/quick-actions`: adding several
 * requirements from a pasted list, and planning a linked check for each
 * requirement that needs one.
 *
 * Each runs as one transaction — all of the paste is added or none of it
 * is; every check is created with its link or none are — and writes the
 * same audit events, through the same repositories, as creating each
 * record by hand would. Permissions are the hand-made ones too: project
 * write access, nothing broader.
 */

/** Interactive transactions default to 5s; a 200-line paste over a slow link needs longer. */
const BULK_TRANSACTION = { timeout: 30_000, maxWait: 10_000 } as const;

const MAX_ATTEMPTS = 3;

/**
 * Runs `create` with a function handing out consecutive automatic numbers,
 * retrying the whole transaction (re-reading the numbers in use) when a
 * concurrent save took one of them first.
 */
async function withConsecutiveNumbers<T>(
  kind: NumberedRecordKind,
  projectId: string,
  create: (takeNumber: () => string) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    const used = await recordIdentifierRepository.listIdentifiersWithPrefix(
      kind,
      projectId,
      identifierPrefix(kind),
    );
    const takeNumber = () => {
      const identifier = nextIdentifier(kind, used);
      used.push(identifier);
      return identifier;
    };
    try {
      return await create(takeNumber);
    } catch (error) {
      if (!(error instanceof ConflictError) || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}

/** Adds each pasted statement as a draft requirement, numbered and titled automatically. */
export async function createRequirementsInBulk(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<Requirement[]> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(createRequirementsInBulkRequestSchema, input, "Invalid requirements");

  return withConsecutiveNumbers("requirement", scopedProjectId, (takeNumber) =>
    prisma.$transaction(async (tx) => {
      const created: Requirement[] = [];
      for (const statement of data.statements) {
        const requirement = await requirementRepository.createRequirement(
          {
            projectId: scopedProjectId,
            identifier: takeNumber(),
            title: deriveRequirementTitle(statement),
            statement,
            rationale: null,
            status: "DRAFT",
            priority: data.priority ?? "MEDIUM",
            source: null,
            ownerId: null,
          },
          tx,
        );
        await auditLogRepository.recordAuditEvent(
          artifactAuditEvent(context, REQUIREMENT_AUDIT_ACTIONS.created, REQUIREMENT_ENTITY_TYPE, requirement.id, {
            identifier: requirement.identifier,
            projectId: scopedProjectId,
            addedFromList: true,
          }),
          tx,
        );
        created.push(requirement);
      }
      return created;
    }, BULK_TRANSACTION),
  );
}

/** The requirements that have no check yet — what "plan a check for each" would cover. */
export async function listRequirementsNeedingChecks(
  context: OrganizationContext,
  projectId: unknown,
): Promise<RequirementCheckCandidate[]> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);
  return requirementRepository.listRequirementsWithoutVerification(scopedProjectId);
}

export interface PlannedCheck {
  requirementId: string;
  requirementIdentifier: string;
  activity: VerificationActivity;
}

/**
 * Plans one check (a PLANNED verification activity) per requirement and
 * links it to that requirement.
 *
 * Without `requirementIds`: every requirement that has no check yet. With
 * them: exactly those — even one that already has a check, since asking
 * for another is a deliberate choice — each of which must be in this
 * project and not obsolete.
 */
export async function planChecks(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<PlannedCheck[]> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(planChecksRequestSchema, input, "Invalid check plan");

  return withConsecutiveNumbers("verificationActivity", scopedProjectId, (takeNumber) =>
    prisma.$transaction(async (tx) => {
      const requirements = data.requirementIds
        ? await requirementRepository.findRequirementsInProject(scopedProjectId, data.requirementIds, tx)
        : await requirementRepository.listRequirementsWithoutVerification(scopedProjectId, tx);

      if (data.requirementIds) {
        const found = new Set(requirements.map((requirement) => requirement.id));
        if (data.requirementIds.some((id) => !found.has(id))) {
          throw new ValidationError("One of those requirements does not exist in this project.");
        }
        const obsolete = requirements.find((requirement) => !areLinksEditable(requirement.status));
        if (obsolete) {
          throw new ConflictError(`${obsolete.identifier} is obsolete and needs no check.`);
        }
      }

      const planned: PlannedCheck[] = [];
      for (const requirement of requirements) {
        const activity = await verificationRepository.createVerificationActivity(
          {
            projectId: scopedProjectId,
            identifier: takeNumber(),
            title: checkTitleFor(requirement.identifier, requirement.title),
            description: null,
            method: data.method,
            plannedDate: null,
            ownerId: null,
          },
          tx,
        );
        await auditLogRepository.recordAuditEvent(
          artifactAuditEvent(context, VERIFICATION_AUDIT_ACTIONS.created, VERIFICATION_ENTITY_TYPE, activity.id, {
            identifier: activity.identifier,
            method: activity.method,
            projectId: scopedProjectId,
            plannedFor: requirement.identifier,
          }),
          tx,
        );

        await requirementRepository.createRequirementLink(
          {
            requirementId: requirement.id,
            relation: "VERIFICATION_ACTIVITY",
            targetId: activity.id,
            createdById: context.actorId,
          },
          tx,
        );
        await auditLogRepository.recordAuditEvent(
          artifactAuditEvent(context, REQUIREMENT_AUDIT_ACTIONS.linkAdded, REQUIREMENT_ENTITY_TYPE, requirement.id, {
            relation: "VERIFICATION_ACTIVITY",
            targetId: activity.id,
          }),
          tx,
        );

        planned.push({ requirementId: requirement.id, requirementIdentifier: requirement.identifier, activity });
      }
      return planned;
    }, BULK_TRANSACTION),
  );
}
