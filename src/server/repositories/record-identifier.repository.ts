import type { NumberedRecordKind } from "@/domain/shared/auto-identifier";
import { type DbClient, prisma } from "@/lib/db";

/**
 * The identifiers already used by one record type in one scope that start
 * with `prefix` — the input `nextIdentifier` picks the next number from.
 *
 * `scopeId` is whatever the record type's identifier is unique within (see
 * the `@@unique([…, identifier])` constraints in schema.prisma): the project
 * for almost everything, the certification program for a basis, the basis
 * for a compliance item, and the compliance item for a finding.
 */
export async function listIdentifiersWithPrefix(
  kind: NumberedRecordKind,
  scopeId: string,
  prefix: string,
  client: DbClient = prisma,
): Promise<string[]> {
  const identifier = { startsWith: prefix };
  const select = { identifier: true } as const;

  const rows: { identifier: string }[] = await (() => {
    switch (kind) {
      case "requirement":
        return client.requirement.findMany({ where: { projectId: scopeId, identifier }, select });
      case "stakeholderNeed":
        return client.stakeholderNeed.findMany({ where: { projectId: scopeId, identifier }, select });
      case "designItem":
        return client.designItem.findMany({ where: { projectId: scopeId, identifier }, select });
      case "decision":
        return client.engineeringDecision.findMany({ where: { projectId: scopeId, identifier }, select });
      case "verificationActivity":
        return client.verificationActivity.findMany({ where: { projectId: scopeId, identifier }, select });
      case "evidence":
        return client.evidence.findMany({ where: { projectId: scopeId, identifier }, select });
      case "risk":
        return client.risk.findMany({ where: { projectId: scopeId, identifier }, select });
      case "issue":
        return client.issue.findMany({ where: { projectId: scopeId, identifier }, select });
      case "changeRequest":
        return client.changeRequest.findMany({ where: { projectId: scopeId, identifier }, select });
      case "supplier":
        return client.supplier.findMany({ where: { projectId: scopeId, identifier }, select });
      case "suppliedItem":
        return client.suppliedItem.findMany({ where: { projectId: scopeId, identifier }, select });
      case "baseline":
        return client.engineeringBaseline.findMany({ where: { projectId: scopeId, identifier }, select });
      case "observation":
        return client.operationalObservation.findMany({ where: { projectId: scopeId, identifier }, select });
      case "certificationProgram":
        return client.certificationProgram.findMany({ where: { projectId: scopeId, identifier }, select });
      case "certificationBasis":
        return client.certificationBasis.findMany({
          where: { certificationProgramId: scopeId, identifier },
          select,
        });
      case "complianceItem":
        return client.complianceItem.findMany({ where: { certificationBasisId: scopeId, identifier }, select });
      case "certificationFinding":
        return client.certificationFinding.findMany({ where: { complianceItemId: scopeId, identifier }, select });
    }
  })();

  return rows.map((row) => row.identifier);
}
