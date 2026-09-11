import {
  type ComplianceItem,
  type ComplianceLink,
  complianceLinkTargetNodeType,
  createComplianceItemRequestSchema,
  createComplianceLinkRequestSchema,
  entityIdSchema,
  isCertificationBasisImmutable,
  parseComplianceLinkKey,
  updateComplianceItemRequestSchema,
} from "@/domain";
import type { ComplianceLinkTargetOptions } from "@/server/repositories/project-artifacts.repository";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as basisRepository from "@/server/repositories/certification-basis.repository";
import * as linkRepository from "@/server/repositories/compliance-link.repository";
import * as itemRepository from "@/server/repositories/compliance-item.repository";
import * as programRepository from "@/server/repositories/certification-program.repository";
import * as projectArtifactsRepository from "@/server/repositories/project-artifacts.repository";
import { parseOrThrow } from "@/server/validation";
import { artifactAuditEvent, requireProjectInOrganization } from "./project-scope";

/**
 * The central certification obligation, and the typed relationships that
 * connect it to real engineering objects.
 *
 * `applicability` and `disposition` are always set here from what the
 * request explicitly says — never derived from a linked artifact's own
 * state. The service enforces that a compliance item's basis (and every
 * object it links to) stays inside the caller's own project; it never widens
 * that boundary.
 */

export const COMPLIANCE_ITEM_ENTITY_TYPE = "ComplianceItem";

export const COMPLIANCE_ITEM_AUDIT_ACTIONS = {
  created: "compliance_item.created",
  updated: "compliance_item.updated",
  linkAdded: "compliance_item.link_added",
  linkRemoved: "compliance_item.link_removed",
} as const;

export class ComplianceItemService {
  async createItem(
    context: OrganizationContext,
    projectId: unknown,
    basisId: unknown,
    input: unknown,
  ): Promise<ComplianceItem> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const basis = await this.requireBasisInProject(scopedProjectId, basisId ?? null);
    const data = parseOrThrow(createComplianceItemRequestSchema, input, "Invalid compliance item");

    return prisma.$transaction(async (tx) => {
      const item = await itemRepository.createItem(
        {
          certificationBasisId: basis.id,
          identifier: data.identifier,
          title: data.title,
          description: data.description ?? null,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          COMPLIANCE_ITEM_AUDIT_ACTIONS.created,
          COMPLIANCE_ITEM_ENTITY_TYPE,
          item.id,
          { identifier: item.identifier, certificationBasisId: basis.id },
        ),
        tx,
      );

      return item;
    });
  }

  async listItems(context: OrganizationContext, projectId: unknown, basisId: unknown = null) {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const basis = await this.requireBasisInProject(scopedProjectId, basisId ?? null);
    return itemRepository.listItemsInBasis(basis.id);
  }

  async getItem(context: OrganizationContext, projectId: unknown, itemId: unknown): Promise<ComplianceItem> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    return this.requireItem(scopedProjectId, itemId);
  }

  async updateItem(
    context: OrganizationContext,
    projectId: unknown,
    itemId: unknown,
    input: unknown,
  ): Promise<ComplianceItem> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const data = parseOrThrow(updateComplianceItemRequestSchema, input, "Invalid compliance item update");

    return prisma.$transaction(async (tx) => {
      const existing = await this.requireItem(scopedProjectId, itemId, tx);

      const isSettingApplicability = data.applicability !== undefined;
      const patch = {
        ...data,
        // Applicability, its rationale and reviewer travel together — a
        // judgement recorded with no accountable author would be worse than
        // no judgement at all.
        ...(isSettingApplicability
          ? { applicabilityReviewerId: context.actorId, applicabilityReviewedAt: new Date() }
          : {}),
      };

      const item = await itemRepository.updateItem(existing.id, patch, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          COMPLIANCE_ITEM_AUDIT_ACTIONS.updated,
          COMPLIANCE_ITEM_ENTITY_TYPE,
          item.id,
          { changedFields: Object.keys(data) },
        ),
        tx,
      );

      return item;
    });
  }

  async listLinkTargets(
    context: OrganizationContext,
    projectId: unknown,
  ): Promise<ComplianceLinkTargetOptions> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    return projectArtifactsRepository.listComplianceLinkTargets(scopedProjectId);
  }

  async listLinks(
    context: OrganizationContext,
    projectId: unknown,
    itemId: unknown,
  ): Promise<ComplianceLink[]> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const item = await this.requireItem(scopedProjectId, itemId);
    return linkRepository.listLinks(item.id);
  }

  /**
   * Links a compliance item to a real engineering (or governance) object.
   *
   * The target id is re-resolved inside the caller's own project, inside this
   * transaction — an id belonging to another project simply does not
   * resolve, so a compliance link can never reach across a tenancy boundary.
   * Only the eight declared link types exist; there is no generic
   * entityType/entityId path.
   */
  async addLink(
    context: OrganizationContext,
    projectId: unknown,
    itemId: unknown,
    input: unknown,
  ): Promise<ComplianceLink> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const request = parseOrThrow(createComplianceLinkRequestSchema, input, "Invalid compliance link");

    return prisma.$transaction(async (tx) => {
      const item = await this.requireItem(scopedProjectId, itemId, tx);

      const exists = await linkRepository.complianceLinkTargetExistsInProject(
        request.linkType,
        request.targetId,
        scopedProjectId,
        tx,
      );
      if (!exists) {
        throw new ValidationError(
          `That ${complianceLinkTargetNodeType(request.linkType).replaceAll("_", " ").toLowerCase()} does not exist in this project.`,
        );
      }

      const already = await linkRepository.complianceLinkExists(
        item.id,
        request.linkType,
        request.targetId,
        tx,
      );
      if (already) {
        throw new ValidationError("That link already exists on this compliance item.");
      }

      const { rowId } = await linkRepository.createLink(
        {
          complianceItemId: item.id,
          linkType: request.linkType,
          targetId: request.targetId,
          note: request.note ?? null,
          createdById: context.actorId,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          COMPLIANCE_ITEM_AUDIT_ACTIONS.linkAdded,
          COMPLIANCE_ITEM_ENTITY_TYPE,
          item.id,
          { linkType: request.linkType, targetId: request.targetId },
        ),
        tx,
      );

      const links = await linkRepository.listLinks(item.id, tx);
      const created = links.find(
        (link) => link.linkType === request.linkType && link.targetId === request.targetId,
      );
      if (!created) {
        // Defensive: the row we just created must be readable back inside
        // the same transaction. If it is not, something else is deeply wrong.
        throw new ValidationError("The link could not be read back after creation.");
      }
      void rowId;
      return created;
    });
  }

  async removeLink(
    context: OrganizationContext,
    projectId: unknown,
    itemId: unknown,
    linkId: unknown,
  ): Promise<void> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const key = typeof linkId === "string" ? parseComplianceLinkKey(linkId) : null;
    if (!key) {
      throw new ValidationError("Invalid compliance link id.");
    }

    await prisma.$transaction(async (tx) => {
      const item = await this.requireItem(scopedProjectId, itemId, tx);

      const deleted = await linkRepository.deleteLink(item.id, key.linkType, key.rowId, tx);
      if (!deleted) {
        throw new NotFoundError("That link was not found on this compliance item.");
      }

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          COMPLIANCE_ITEM_AUDIT_ACTIONS.linkRemoved,
          COMPLIANCE_ITEM_ENTITY_TYPE,
          item.id,
          { linkType: key.linkType },
        ),
        tx,
      );
    });
  }

  // --- Internals --------------------------------------------------------

  private async requireBasisInProject(
    projectId: string,
    basisId: unknown | null,
    client?: Parameters<typeof basisRepository.findBasisInProgram>[2],
  ) {
    const program = await programRepository.findProgramInProject(projectId, client);
    if (!program) {
      throw new NotFoundError("This project has no certification program yet.");
    }

    let basis;
    if (basisId === null || basisId === undefined || basisId === "") {
      basis = await basisRepository.findActiveBasis(program.id, client);
      if (!basis) {
        throw new NotFoundError(
          "This certification program has no active basis. Pass basisId explicitly to work with a draft basis.",
        );
      }
    } else {
      const id = parseOrThrow(entityIdSchema, basisId, "Invalid certification basis id");
      basis = await basisRepository.findBasisInProgram(program.id, id, client);
      if (!basis) {
        throw new NotFoundError(`Certification basis ${id} was not found.`);
      }
    }
    // Compliance items may only be created while the basis is being
    // assembled or is the fixed active reference; membership additions
    // beyond DRAFT/ACTIVE (i.e. a SUPERSEDED basis) are refused so history
    // is never mutated after the fact.
    if (isCertificationBasisImmutable(basis.status) && basis.status !== "ACTIVE") {
      throw new ValidationError(
        `Certification basis ${basis.identifier} is ${basis.status} and can no longer receive new compliance items.`,
      );
    }
    return basis;
  }

  async requireItem(
    projectId: string,
    itemId: unknown,
    client?: Parameters<typeof itemRepository.findItemInProject>[2],
  ): Promise<ComplianceItem> {
    const id = parseOrThrow(entityIdSchema, itemId, "Invalid compliance item id");
    const item = await itemRepository.findItemInProject(projectId, id, client);
    if (!item) {
      throw new NotFoundError(`Compliance item ${id} was not found.`);
    }
    return item;
  }
}

export const complianceItemService = new ComplianceItemService();
