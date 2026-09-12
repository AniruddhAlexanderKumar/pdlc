import {
  traceabilityNodeTypeSchema,
  type TraceabilityRootOption,
  type TraceabilitySelectableNodeType,
} from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { parseOrThrow } from "@/server/validation";
import { certificationBasisService } from "./certification-basis.service";
import { certificationProgramService } from "./certification-program.service";
import { certificationReviewService } from "./certification-review.service";
import * as changeRequestService from "./change-request.service";
import * as designItemService from "./design-item.service";
import { complianceItemService } from "./compliance-item.service";
import { driftDetectionService } from "./drift-detection.service";
import * as engineeringDecisionService from "./engineering-decision.service";
import * as evidenceService from "./evidence.service";
import * as issueService from "./issue.service";
import { requireProjectInOrganization } from "./project-scope";
import * as requirementService from "./requirement.service";
import * as riskService from "./risk.service";
import * as stakeholderNeedService from "./stakeholder-need.service";
import * as suppliedItemService from "./supplied-item.service";
import * as supplierQualificationService from "./supplier-qualification.service";
import * as supplierService from "./supplier.service";
import * as verificationActivityService from "./verification-activity.service";

/**
 * Populates the Traceability workspace's object picker.
 *
 * This is not a second listing API — every branch below calls straight into
 * that module's own, already-existing service. It exists because the picker
 * needs one normalized shape (`{ id, identifier, label }`) across the
 * seventeen node types that have a genuine project-wide listing, and no
 * single existing endpoint returns that. See `TRACEABILITY_SELECTABLE_NODE_TYPES`
 * and `TRACEABILITY_UNSELECTABLE_REASONS` in the domain layer for which types
 * these are and why the rest are excluded.
 *
 * Nothing here writes anything, and nothing here is audited — it is a read
 * over data other services already own.
 */
export async function listSelectableRoots(
  context: OrganizationContext,
  projectId: unknown,
  nodeType: unknown,
): Promise<TraceabilityRootOption[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const type = parseOrThrow(
    traceabilityNodeTypeSchema,
    nodeType,
    "Invalid or unsupported traceability object type",
  );

  return loadRoots(context, scopedProjectId, type);
}

async function loadRoots(
  context: OrganizationContext,
  projectId: string,
  type: TraceabilitySelectableNodeType,
): Promise<TraceabilityRootOption[]> {
  switch (type) {
    case "REQUIREMENT": {
      const rows = await requirementService.listRequirements(context, projectId, {});
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.title }));
    }
    case "STAKEHOLDER_NEED": {
      const rows = await stakeholderNeedService.listStakeholderNeeds(context, projectId, {});
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.title }));
    }
    case "DESIGN_ITEM": {
      const rows = await designItemService.listDesignItems(context, projectId, {});
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.name }));
    }
    case "VERIFICATION_ACTIVITY": {
      const rows = await verificationActivityService.listVerificationActivities(
        context,
        projectId,
        {},
      );
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.title }));
    }
    case "ENGINEERING_DECISION": {
      const rows = await engineeringDecisionService.listDecisions(context, projectId, {});
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.title }));
    }
    case "RISK": {
      const rows = await riskService.listRisks(context, projectId, {});
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.title }));
    }
    case "ISSUE": {
      const rows = await issueService.listIssues(context, projectId, {});
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.title }));
    }
    case "CHANGE_REQUEST": {
      const rows = await changeRequestService.listChangeRequests(context, projectId, {});
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.title }));
    }
    case "SUPPLIER": {
      const rows = await supplierService.listSuppliers(context, projectId, {});
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.name }));
    }
    case "SUPPLIED_ITEM": {
      const rows = await suppliedItemService.listSuppliedItems(context, projectId, {});
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.name }));
    }
    case "SUPPLIER_QUALIFICATION": {
      const rows = await supplierQualificationService.listSupplierQualifications(
        context,
        projectId,
        {},
      );
      return rows.map((row) => ({
        id: row.id,
        // A qualification carries no identifier of its own; the supplier's is
        // the one an engineer would recognize it by, exactly as the
        // certification and baseline pickers already show it.
        identifier: row.supplier.identifier,
        label: row.title,
      }));
    }
    case "ENGINEERING_BASELINE": {
      const rows = await driftDetectionService.listBaselines(context, projectId);
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.name }));
    }
    case "OPERATIONAL_OBSERVATION": {
      const rows = await driftDetectionService.listObservations(context, projectId, {});
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.title }));
    }
    case "DRIFT_ASSESSMENT": {
      const rows = await driftDetectionService.listDriftHistory(context, projectId);
      return rows.map((row) => ({
        id: row.id,
        // An assessment has no title; its verdict and moment identify it —
        // the same label the graph node loader itself uses.
        identifier: null,
        label: timestampedLabel(row.status, row.evaluatedAt),
      }));
    }
    case "CERTIFICATION_BASIS": {
      const program = await certificationProgramService.getProgram(context, projectId);
      if (!program) return [];
      const rows = await certificationBasisService.listBases(context, projectId);
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.title }));
    }
    case "COMPLIANCE_ITEM": {
      const program = await certificationProgramService.getProgram(context, projectId);
      if (!program) return [];
      const bases = await certificationBasisService.listBases(context, projectId);
      // Every basis, not just the active one — `listItems`'s own default
      // (basisId omitted) resolves *only* the active basis and throws when
      // there is none, which would make a project mid-revision look like an
      // error instead of showing what it actually has.
      const perBasis = await Promise.all(
        bases.map((basis) => complianceItemService.listItems(context, projectId, basis.id)),
      );
      return perBasis
        .flat()
        .map((row) => ({ id: row.id, identifier: row.identifier, label: row.title }));
    }
    case "EVIDENCE": {
      const rows = await evidenceService.listEvidence(context, projectId, {});
      return rows.map((row) => ({ id: row.id, identifier: row.identifier, label: row.title }));
    }
    case "CERTIFICATION_REVIEW": {
      const program = await certificationProgramService.getProgram(context, projectId);
      if (!program) return [];
      const rows = await certificationReviewService.listCertificationReviewHistory(
        context,
        projectId,
      );
      return rows.map((row) => ({
        id: row.id,
        // A review has no title either; same reasoning as a drift assessment.
        identifier: null,
        label: timestampedLabel(row.status, row.evaluatedAt),
      }));
    }
    default: {
      const exhaustive: never = type;
      throw new Error(`Unhandled traceability node type: ${String(exhaustive)}`);
    }
  }
}

function timestampedLabel(status: string, at: Date): string {
  return `${status} · ${at.toISOString()}`;
}
