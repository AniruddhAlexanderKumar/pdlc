import {
  activateCertificationBasisRequestSchema,
  canTransitionCertificationBasis,
  type CertificationBasis,
  createCertificationBasisRequestSchema,
  entityIdSchema,
  isCertificationBasisEditable,
  supersedeCertificationBasisRequestSchema,
  updateCertificationBasisRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as basisRepository from "@/server/repositories/certification-basis.repository";
import * as programRepository from "@/server/repositories/certification-program.repository";
import { parseOrThrow } from "@/server/validation";
import {
  artifactAuditEvent,
  requireProjectInOrganization,
  requireProjectApproveAccess,
  requireProjectWriteAccess,
} from "./project-scope";
import { withRecordIdentifier } from "./record-identifier";

/**
 * The tracked certification standard/basis lifecycle: DRAFT (editable) ->
 * ACTIVE (immutable, the basis compliance items are tracked against) ->
 * SUPERSEDED (immutable, still readable). Mirrors EngineeringBaseline's
 * lifecycle exactly, for the same reason: a basis that could move after
 * activation would make every compliance item tracked against it ambiguous
 * about what it was actually tracked against.
 */

export const CERTIFICATION_BASIS_ENTITY_TYPE = "CertificationBasis";

export const CERTIFICATION_BASIS_AUDIT_ACTIONS = {
  created: "certification_basis.created",
  updated: "certification_basis.updated",
  activated: "certification_basis.activated",
  superseded: "certification_basis.superseded",
} as const;

export class CertificationBasisService {
  async createBasis(
    context: OrganizationContext,
    projectId: unknown,
    input: unknown,
  ): Promise<CertificationBasis> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    const program = await this.requireProgram(scopedProjectId);
    const data = parseOrThrow(createCertificationBasisRequestSchema, input, "Invalid certification basis");

    return withRecordIdentifier(data.identifier, "certificationBasis", program.id, (identifier) =>
      prisma.$transaction(async (tx) => {
        const basis = await basisRepository.createBasis(
          {
            certificationProgramId: program.id,
            identifier,
            title: data.title,
            description: data.description ?? null,
            revision: data.revision,
            sourceReference: data.sourceReference ?? null,
            createdById: context.actorId,
          },
          tx,
        );

        await auditLogRepository.recordAuditEvent(
          artifactAuditEvent(
            context,
            CERTIFICATION_BASIS_AUDIT_ACTIONS.created,
            CERTIFICATION_BASIS_ENTITY_TYPE,
            basis.id,
            { identifier: basis.identifier, certificationProgramId: program.id },
          ),
          tx,
        );

        return basis;
      }),
    );
  }

  async listBases(context: OrganizationContext, projectId: unknown): Promise<CertificationBasis[]> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const program = await this.requireProgram(scopedProjectId);
    return basisRepository.listBasesInProgram(program.id);
  }

  async getBasis(
    context: OrganizationContext,
    projectId: unknown,
    basisId: unknown,
  ): Promise<CertificationBasis> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const program = await this.requireProgram(scopedProjectId);
    return this.requireBasis(program.id, basisId);
  }

  async updateBasis(
    context: OrganizationContext,
    projectId: unknown,
    basisId: unknown,
    input: unknown,
  ): Promise<CertificationBasis> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    const program = await this.requireProgram(scopedProjectId);
    const data = parseOrThrow(
      updateCertificationBasisRequestSchema,
      input,
      "Invalid certification basis update",
    );

    return prisma.$transaction(async (tx) => {
      const existing = await this.requireBasis(program.id, basisId, tx);
      if (!isCertificationBasisEditable(existing.status)) {
        throw new ConflictError(
          `Certification basis ${existing.identifier} is ${existing.status} and can no longer be edited.`,
        );
      }

      const basis = await basisRepository.updateBasis(existing.id, data, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          CERTIFICATION_BASIS_AUDIT_ACTIONS.updated,
          CERTIFICATION_BASIS_ENTITY_TYPE,
          basis.id,
          { changedFields: Object.keys(data) },
        ),
        tx,
      );

      return basis;
    });
  }

  /**
   * Fixes this basis as the one compliance items are tracked against.
   *
   * Refused if another basis is already ACTIVE, unless `supersedeActive` is
   * set — nothing swaps the active basis silently, because every existing
   * compliance item's tracked-against basis would otherwise become ambiguous.
   */
  async activateBasis(
    context: OrganizationContext,
    projectId: unknown,
    basisId: unknown,
    input: unknown = {},
  ): Promise<CertificationBasis> {
    const scopedProjectId = await requireProjectApproveAccess(context, projectId);
    const program = await this.requireProgram(scopedProjectId);
    const request = parseOrThrow(
      activateCertificationBasisRequestSchema,
      input ?? {},
      "Invalid activation request",
    );

    return prisma.$transaction(async (tx) => {
      const existing = await this.requireBasis(program.id, basisId, tx);
      if (!canTransitionCertificationBasis(existing.status, "ACTIVE")) {
        throw new ConflictError(
          `Certification basis ${existing.identifier} is ${existing.status} and cannot be activated.`,
        );
      }

      const currentActive = await basisRepository.findActiveBasis(program.id, tx);
      if (currentActive && currentActive.id !== existing.id) {
        if (!request.supersedeActive) {
          throw new ConflictError(
            `Certification basis ${currentActive.identifier} is already ACTIVE. Pass supersedeActive to replace it explicitly.`,
          );
        }
        await basisRepository.supersedeBasis(currentActive.id, existing.id, tx);
        await auditLogRepository.recordAuditEvent(
          artifactAuditEvent(
            context,
            CERTIFICATION_BASIS_AUDIT_ACTIONS.superseded,
            CERTIFICATION_BASIS_ENTITY_TYPE,
            currentActive.id,
            { supersededById: existing.id },
          ),
          tx,
        );
      }

      const basis = await basisRepository.activateBasis(existing.id, context.actorId, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          CERTIFICATION_BASIS_AUDIT_ACTIONS.activated,
          CERTIFICATION_BASIS_ENTITY_TYPE,
          basis.id,
          { certificationProgramId: program.id },
        ),
        tx,
      );

      return basis;
    });
  }

  /** Explicit supersession of an already-ACTIVE basis by a named replacement. */
  async supersedeBasis(
    context: OrganizationContext,
    projectId: unknown,
    basisId: unknown,
    input: unknown,
  ): Promise<CertificationBasis> {
    const scopedProjectId = await requireProjectApproveAccess(context, projectId);
    const program = await this.requireProgram(scopedProjectId);
    const request = parseOrThrow(
      supersedeCertificationBasisRequestSchema,
      input,
      "Invalid supersession request",
    );

    return prisma.$transaction(async (tx) => {
      const existing = await this.requireBasis(program.id, basisId, tx);
      if (!canTransitionCertificationBasis(existing.status, "SUPERSEDED")) {
        throw new ConflictError(
          `Certification basis ${existing.identifier} is ${existing.status} and cannot be superseded.`,
        );
      }

      const replacement = await this.requireBasis(program.id, request.newBasisId, tx);
      if (replacement.id === existing.id) {
        throw new ValidationError("A certification basis cannot supersede itself.");
      }

      const basis = await basisRepository.supersedeBasis(existing.id, replacement.id, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          CERTIFICATION_BASIS_AUDIT_ACTIONS.superseded,
          CERTIFICATION_BASIS_ENTITY_TYPE,
          basis.id,
          { supersededById: replacement.id },
        ),
        tx,
      );

      return basis;
    });
  }

  // --- Internals --------------------------------------------------------

  private async requireProgram(projectId: string) {
    const program = await programRepository.findProgramInProject(projectId);
    if (!program) {
      throw new NotFoundError("This project has no certification program yet.");
    }
    return program;
  }

  async requireBasis(
    certificationProgramId: string,
    basisId: unknown,
    client?: Parameters<typeof basisRepository.findBasisInProgram>[2],
  ): Promise<CertificationBasis> {
    const id = parseOrThrow(entityIdSchema, basisId, "Invalid certification basis id");
    const basis = await basisRepository.findBasisInProgram(certificationProgramId, id, client);
    if (!basis) {
      throw new NotFoundError(`Certification basis ${id} was not found.`);
    }
    return basis;
  }
}

export const certificationBasisService = new CertificationBasisService();
