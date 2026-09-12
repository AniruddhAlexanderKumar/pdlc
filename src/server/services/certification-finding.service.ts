import {
  acceptCertificationFindingRequestSchema,
  type CertificationFinding,
  createCertificationFindingRequestSchema,
  entityIdSchema,
  isCertificationFindingOpen,
  resolveCertificationFindingRequestSchema,
  updateCertificationFindingRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as findingRepository from "@/server/repositories/certification-finding.repository";
import { evidenceExistsInProject } from "@/server/repositories/supplier-qualification.repository";
import { complianceItemService } from "./compliance-item.service";
import { parseOrThrow } from "@/server/validation";
import {
  artifactAuditEvent,
  requireProjectInOrganization,
  requireProjectApproveAccess,
  requireProjectWriteAccess,
} from "./project-scope";

/**
 * Certification/compliance findings.
 *
 * Severity is an explicit human classification, never a derived score.
 * Resolution and acceptance both require a note, an actor and a timestamp —
 * a finding never silently disappears, and this service exposes no delete.
 */

export const CERTIFICATION_FINDING_ENTITY_TYPE = "CertificationFinding";

export const CERTIFICATION_FINDING_AUDIT_ACTIONS = {
  created: "certification_finding.created",
  updated: "certification_finding.updated",
  resolved: "certification_finding.resolved",
  accepted: "certification_finding.accepted",
} as const;

export class CertificationFindingService {
  async createFinding(
    context: OrganizationContext,
    projectId: unknown,
    itemId: unknown,
    input: unknown,
  ): Promise<CertificationFinding> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    const data = parseOrThrow(
      createCertificationFindingRequestSchema,
      input,
      "Invalid certification finding",
    );

    return prisma.$transaction(async (tx) => {
      const item = await complianceItemService.requireItem(scopedProjectId, itemId, tx);

      const finding = await findingRepository.createFinding(
        {
          complianceItemId: item.id,
          identifier: data.identifier,
          title: data.title,
          description: data.description ?? null,
          severity: data.severity,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          CERTIFICATION_FINDING_AUDIT_ACTIONS.created,
          CERTIFICATION_FINDING_ENTITY_TYPE,
          finding.id,
          { identifier: finding.identifier, severity: finding.severity, complianceItemId: item.id },
        ),
        tx,
      );

      return finding;
    });
  }

  async listFindings(
    context: OrganizationContext,
    projectId: unknown,
    itemId: unknown,
  ): Promise<CertificationFinding[]> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const item = await complianceItemService.requireItem(scopedProjectId, itemId);
    return findingRepository.listFindingsForItem(item.id);
  }

  async updateFinding(
    context: OrganizationContext,
    projectId: unknown,
    itemId: unknown,
    findingId: unknown,
    input: unknown,
  ): Promise<CertificationFinding> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    const data = parseOrThrow(
      updateCertificationFindingRequestSchema,
      input,
      "Invalid certification finding update",
    );

    return prisma.$transaction(async (tx) => {
      const item = await complianceItemService.requireItem(scopedProjectId, itemId, tx);
      const existing = await this.requireFinding(item.id, findingId, tx);
      if (!isCertificationFindingOpen(existing.status)) {
        throw new ConflictError(
          `Certification finding ${existing.identifier} is ${existing.status} and can no longer be edited directly.`,
        );
      }

      const finding = await findingRepository.updateFinding(existing.id, data, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          CERTIFICATION_FINDING_AUDIT_ACTIONS.updated,
          CERTIFICATION_FINDING_ENTITY_TYPE,
          finding.id,
          { changedFields: Object.keys(data) },
        ),
        tx,
      );

      return finding;
    });
  }

  async resolveFinding(
    context: OrganizationContext,
    projectId: unknown,
    itemId: unknown,
    findingId: unknown,
    input: unknown,
  ): Promise<CertificationFinding> {
    return this.disposition(context, projectId, itemId, findingId, input, "RESOLVED");
  }

  async acceptFinding(
    context: OrganizationContext,
    projectId: unknown,
    itemId: unknown,
    findingId: unknown,
    input: unknown,
  ): Promise<CertificationFinding> {
    return this.disposition(context, projectId, itemId, findingId, input, "ACCEPTED");
  }

  private async disposition(
    context: OrganizationContext,
    projectId: unknown,
    itemId: unknown,
    findingId: unknown,
    input: unknown,
    status: "RESOLVED" | "ACCEPTED",
  ): Promise<CertificationFinding> {
    const scopedProjectId = await requireProjectApproveAccess(context, projectId);
    const schema =
      status === "RESOLVED"
        ? resolveCertificationFindingRequestSchema
        : acceptCertificationFindingRequestSchema;
    const data = parseOrThrow(schema, input, "Invalid finding disposition");

    return prisma.$transaction(async (tx) => {
      const item = await complianceItemService.requireItem(scopedProjectId, itemId, tx);
      const existing = await this.requireFinding(item.id, findingId, tx);
      if (!isCertificationFindingOpen(existing.status)) {
        throw new ConflictError(
          `Certification finding ${existing.identifier} is already ${existing.status}.`,
        );
      }

      let evidenceId: string | null = null;
      if (data.evidenceId) {
        const exists = await evidenceExistsInProject(data.evidenceId, scopedProjectId, tx);
        if (!exists) {
          throw new ValidationError("That evidence does not exist in this project.");
        }
        evidenceId = data.evidenceId;
      }

      const finding = await findingRepository.dispositionFinding(
        existing.id,
        status,
        data.note,
        evidenceId,
        context.actorId,
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          status === "RESOLVED"
            ? CERTIFICATION_FINDING_AUDIT_ACTIONS.resolved
            : CERTIFICATION_FINDING_AUDIT_ACTIONS.accepted,
          CERTIFICATION_FINDING_ENTITY_TYPE,
          finding.id,
          { resolvedById: context.actorId },
        ),
        tx,
      );

      return finding;
    });
  }

  private async requireFinding(
    complianceItemId: string,
    findingId: unknown,
    client?: Parameters<typeof findingRepository.findFindingInItem>[2],
  ): Promise<CertificationFinding> {
    const id = parseOrThrow(entityIdSchema, findingId, "Invalid certification finding id");
    const finding = await findingRepository.findFindingInItem(complianceItemId, id, client);
    if (!finding) {
      throw new NotFoundError(`Certification finding ${id} was not found.`);
    }
    return finding;
  }
}

export const certificationFindingService = new CertificationFindingService();
