import {
  canTransitionCertificationProgram,
  type CertificationProgram,
  createCertificationProgramRequestSchema,
  updateCertificationProgramRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as programRepository from "@/server/repositories/certification-program.repository";
import { parseOrThrow } from "@/server/validation";
import { requireAssignableOwner } from "./authorization.service";
import {
  artifactAuditEvent,
  requireProjectReadAccess,
  requireProjectWriteAccess,
} from "./project-scope";

/**
 * The certification workspace's project-level anchor.
 *
 * Exactly one per project — enforced by a database unique constraint on
 * `projectId`, not just a service convention — because the API surface is
 * deliberately singular: `GET/POST/PATCH /certification/program`, with no id.
 * A project runs one internal certification effort, not a collection of
 * competing ones. None of the statuses here is, or implies, an external
 * regulatory approval state.
 */

export const CERTIFICATION_PROGRAM_ENTITY_TYPE = "CertificationProgram";

export const CERTIFICATION_PROGRAM_AUDIT_ACTIONS = {
  created: "certification_program.created",
  updated: "certification_program.updated",
} as const;

export class CertificationProgramService {
  async createProgram(
    context: OrganizationContext,
    projectId: unknown,
    input: unknown,
  ): Promise<CertificationProgram> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    const data = parseOrThrow(
      createCertificationProgramRequestSchema,
      input,
      "Invalid certification program",
    );

    if (data.ownerId) {
      await requireAssignableOwner(context, scopedProjectId, data.ownerId);
    }

    return prisma.$transaction(async (tx) => {
      const existing = await programRepository.findProgramInProject(scopedProjectId, tx);
      if (existing) {
        throw new ConflictError(
          "A certification program already exists for this project. Update it instead of creating another.",
        );
      }

      const program = await programRepository.createProgram(
        {
          projectId: scopedProjectId,
          identifier: data.identifier,
          name: data.name,
          description: data.description ?? null,
          ownerId: data.ownerId ?? null,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          CERTIFICATION_PROGRAM_AUDIT_ACTIONS.created,
          CERTIFICATION_PROGRAM_ENTITY_TYPE,
          program.id,
          { identifier: program.identifier, projectId: scopedProjectId },
        ),
        tx,
      );

      return program;
    });
  }

  /** Distinct from "not found" at the route layer: a project simply may not have one yet. */
  async getProgram(
    context: OrganizationContext,
    projectId: unknown,
  ): Promise<CertificationProgram | null> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    return programRepository.findProgramInProject(scopedProjectId);
  }

  async updateProgram(
    context: OrganizationContext,
    projectId: unknown,
    input: unknown,
  ): Promise<CertificationProgram> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    const data = parseOrThrow(
      updateCertificationProgramRequestSchema,
      input,
      "Invalid certification program update",
    );

    if (data.ownerId) {
      await requireAssignableOwner(context, scopedProjectId, data.ownerId);
    }

    return prisma.$transaction(async (tx) => {
      const existing = await programRepository.findProgramInProject(scopedProjectId, tx);
      if (!existing) {
        throw new NotFoundError("This project has no certification program yet.");
      }

      if (data.status) {
        if (data.status === existing.status) {
          // Same shape as Risk's transitionRisk: a request to move to the
          // status it's already at is a stale-caller conflict, not a free
          // no-op — silently allowing it is exactly the gap that let a
          // sequential-after-commit racer "succeed" at a redundant write
          // instead of being told someone else already moved it there.
          throw new ConflictError(`This certification program is already ${data.status}.`);
        }
        if (!canTransitionCertificationProgram(existing.status, data.status)) {
          throw new ConflictError(
            `A certification program cannot move from ${existing.status} to ${data.status}.`,
          );
        }
      }

      const program = data.status
        ? await programRepository.updateProgramGuarded(existing.id, existing.status, data, tx)
        : await programRepository.updateProgram(existing.id, data, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          CERTIFICATION_PROGRAM_AUDIT_ACTIONS.updated,
          CERTIFICATION_PROGRAM_ENTITY_TYPE,
          program.id,
          { changedFields: Object.keys(data) },
        ),
        tx,
      );

      return program;
    });
  }
}

export const certificationProgramService = new CertificationProgramService();
