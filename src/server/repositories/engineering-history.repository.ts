import type { HistoryObjectType } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * Reads backing the Engineering History workspace.
 *
 * Two responsibilities, and nothing else:
 *
 *   1. `listProjectArtifacts` — for every object type this capability treats
 *      as an `AuditLog`-backed artifact, every object of that type *in this
 *      project*, with just enough identity to label a history event and
 *      resolve it back to a real record. One query per type, exactly the
 *      same project-wide enumeration `DecisionSentinelService
 *      .loadContentChangeCandidates` already performs for its own detection
 *      sweep — reused here for a different purpose, not duplicated logic.
 *   2. `listAuditEventsForProjectArtifacts` — the batched `AuditLog` read
 *      over every id `listProjectArtifacts` found, one query total (an `OR`
 *      of per-type `entityId IN (...)` clauses), scoped by organization the
 *      same way `listAuditEventsForEntity` already is.
 *
 * Nothing here writes a row. Nothing here is a second audit mechanism —
 * every event returned is read straight out of the one `audit_logs` table
 * that already exists.
 */

export interface ProjectArtifactRef {
  id: string;
  identifier: string | null;
  label: string;
  createdAt: Date;
  /** Set only for a certification finding: the compliance item it was raised against, its own nearest real detail page. */
  parentId?: string;
}

/**
 * Every `AuditLog` `entityType` string this capability reads, mapped to the
 * `HistoryObjectType` a reader navigates to (`null` where the type has no
 * standalone detail page — a certification basis, a compliance item, a
 * certification finding, an operational observation — matching
 * `HISTORY_OBJECT_TYPES`/`traceabilityDetailRoute` exactly, not a second
 * decision about the same question).
 */
export const HISTORY_ARTIFACT_ENTITY_TYPES: ReadonlyArray<{
  entityType: string;
  objectType: HistoryObjectType | null;
}> = [
  { entityType: "Requirement", objectType: "REQUIREMENT" },
  { entityType: "DesignItem", objectType: "DESIGN_ITEM" },
  { entityType: "EngineeringDecision", objectType: "ENGINEERING_DECISION" },
  { entityType: "Risk", objectType: "RISK" },
  { entityType: "Issue", objectType: "ISSUE" },
  { entityType: "Evidence", objectType: "EVIDENCE" },
  { entityType: "ChangeRequest", objectType: "CHANGE_REQUEST" },
  { entityType: "EngineeringBaseline", objectType: "ENGINEERING_BASELINE" },
  { entityType: "Supplier", objectType: "SUPPLIER" },
  { entityType: "SuppliedItem", objectType: "SUPPLIED_ITEM" },
  { entityType: "SupplierQualification", objectType: "SUPPLIER_QUALIFICATION" },
  { entityType: "VerificationActivity", objectType: "VERIFICATION_ACTIVITY" },
  { entityType: "StakeholderNeed", objectType: "STAKEHOLDER_NEED" },
  { entityType: "CertificationBasis", objectType: null },
  { entityType: "ComplianceItem", objectType: "COMPLIANCE_ITEM" },
  { entityType: "CertificationFinding", objectType: null },
  { entityType: "OperationalObservation", objectType: null },
];

/**
 * Every object of one `AuditLog`-backed artifact type, in one project.
 *
 * `client` selections are intentionally minimal — identity and a label,
 * never the full record — because this exists only to seed a history event,
 * not to duplicate what each module's own detail page already returns.
 */
export async function listProjectArtifacts(
  projectId: string,
  client: DbClient = prisma,
): Promise<Map<string, ProjectArtifactRef[]>> {
  const [
    requirements,
    designItems,
    decisions,
    risks,
    issues,
    evidence,
    changes,
    baselines,
    suppliers,
    suppliedItems,
    qualifications,
    activities,
    needs,
    bases,
    items,
    findings,
    observations,
  ] = await Promise.all([
    client.requirement.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true },
    }),
    client.designItem.findMany({
      where: { projectId },
      select: { id: true, identifier: true, name: true, createdAt: true },
    }),
    client.engineeringDecision.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true },
    }),
    client.risk.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true },
    }),
    client.issue.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true },
    }),
    client.evidence.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true },
    }),
    client.changeRequest.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true },
    }),
    client.engineeringBaseline.findMany({
      where: { projectId },
      select: { id: true, identifier: true, name: true, createdAt: true },
    }),
    client.supplier.findMany({
      where: { projectId },
      select: { id: true, identifier: true, name: true, createdAt: true },
    }),
    client.suppliedItem.findMany({
      where: { projectId },
      select: { id: true, identifier: true, name: true, createdAt: true },
    }),
    client.supplierQualification.findMany({
      where: { projectId },
      select: { id: true, title: true, createdAt: true },
    }),
    client.verificationActivity.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true },
    }),
    client.stakeholderNeed.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true },
    }),
    client.certificationBasis.findMany({
      where: { certificationProgram: { projectId } },
      select: { id: true, identifier: true, title: true, createdAt: true },
    }),
    client.complianceItem.findMany({
      where: { certificationBasis: { certificationProgram: { projectId } } },
      select: { id: true, identifier: true, title: true, createdAt: true },
    }),
    client.certificationFinding.findMany({
      where: { complianceItem: { certificationBasis: { certificationProgram: { projectId } } } },
      select: { id: true, identifier: true, title: true, createdAt: true, complianceItemId: true },
    }),
    client.operationalObservation.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, createdAt: true },
    }),
  ]);

  const asRef = (
    row: { id: string; createdAt: Date; complianceItemId?: string },
    identifier: string | null,
    label: string,
  ): ProjectArtifactRef => ({
    id: row.id,
    identifier,
    label,
    createdAt: row.createdAt,
    ...(row.complianceItemId ? { parentId: row.complianceItemId } : {}),
  });

  const result = new Map<string, ProjectArtifactRef[]>();
  result.set("Requirement", requirements.map((r) => asRef(r, r.identifier, r.title)));
  result.set("DesignItem", designItems.map((r) => asRef(r, r.identifier, r.name)));
  result.set("EngineeringDecision", decisions.map((r) => asRef(r, r.identifier, r.title)));
  result.set("Risk", risks.map((r) => asRef(r, r.identifier, r.title)));
  result.set("Issue", issues.map((r) => asRef(r, r.identifier, r.title)));
  result.set("Evidence", evidence.map((r) => asRef(r, r.identifier, r.title)));
  result.set("ChangeRequest", changes.map((r) => asRef(r, r.identifier, r.title)));
  result.set("EngineeringBaseline", baselines.map((r) => asRef(r, r.identifier, r.name)));
  result.set("Supplier", suppliers.map((r) => asRef(r, r.identifier, r.name)));
  result.set("SuppliedItem", suppliedItems.map((r) => asRef(r, r.identifier, r.name)));
  result.set("SupplierQualification", qualifications.map((r) => asRef(r, null, r.title)));
  result.set("VerificationActivity", activities.map((r) => asRef(r, r.identifier, r.title)));
  result.set("StakeholderNeed", needs.map((r) => asRef(r, r.identifier, r.title)));
  result.set("CertificationBasis", bases.map((r) => asRef(r, r.identifier, r.title)));
  result.set("ComplianceItem", items.map((r) => asRef(r, r.identifier, r.title)));
  result.set("CertificationFinding", findings.map((r) => asRef(r, r.identifier, r.title)));
  result.set("OperationalObservation", observations.map((r) => asRef(r, r.identifier, r.title)));

  return result;
}

export interface HistoryAuditRow {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: Date;
  actor: { id: string; name: string } | null;
  metadata: unknown;
}

/**
 * The batched `AuditLog` read: one query, an `OR` of per-type
 * `entityId IN (...)` clauses, scoped by organization exactly as
 * `listAuditEventsForEntity` already scopes a single-entity read. Bounded by
 * `limit` per call — this feeds a history stream, not an unbounded export.
 */
export async function listAuditEventsForProjectArtifacts(
  organizationId: string,
  entityIdsByType: ReadonlyMap<string, readonly string[]>,
  limit = 1000,
  client: DbClient = prisma,
): Promise<HistoryAuditRow[]> {
  const clauses = [...entityIdsByType.entries()]
    .filter(([, ids]) => ids.length > 0)
    .map(([entityType, ids]) => ({ entityType, entityId: { in: [...ids] } }));

  if (clauses.length === 0) return [];

  const rows = await client.auditLog.findMany({
    where: { organizationId, OR: clauses },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      action: true,
      createdAt: true,
      metadata: true,
      actor: { select: { id: true, name: true } },
    },
  });

  return rows;
}
