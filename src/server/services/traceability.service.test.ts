// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError, ValidationError } from "@/server/errors";

/**
 * Traceability root-listing behavior against fake sibling services: no
 * database, no Prisma. Every branch of `listSelectableRoots` calls straight
 * into another module's own service, so these tests mostly assert the
 * dispatch and field mapping are correct — the underlying listing behavior
 * is that module's own responsibility and is tested there.
 */

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("./requirement.service", () => ({ listRequirements: vi.fn() }));
vi.mock("./stakeholder-need.service", () => ({ listStakeholderNeeds: vi.fn() }));
vi.mock("./design-item.service", () => ({ listDesignItems: vi.fn() }));
vi.mock("./verification-activity.service", () => ({ listVerificationActivities: vi.fn() }));
vi.mock("./engineering-decision.service", () => ({ listDecisions: vi.fn() }));
vi.mock("./risk.service", () => ({ listRisks: vi.fn() }));
vi.mock("./issue.service", () => ({ listIssues: vi.fn() }));
vi.mock("./change-request.service", () => ({ listChangeRequests: vi.fn() }));
vi.mock("./supplier.service", () => ({ listSuppliers: vi.fn() }));
vi.mock("./supplied-item.service", () => ({ listSuppliedItems: vi.fn() }));
vi.mock("./supplier-qualification.service", () => ({ listSupplierQualifications: vi.fn() }));
vi.mock("./drift-detection.service", () => ({
  driftDetectionService: {
    listBaselines: vi.fn(),
    listObservations: vi.fn(),
    listDriftHistory: vi.fn(),
  },
}));
vi.mock("./certification-program.service", () => ({
  certificationProgramService: { getProgram: vi.fn() },
}));
vi.mock("./certification-basis.service", () => ({
  certificationBasisService: { listBases: vi.fn() },
}));
vi.mock("./compliance-item.service", () => ({
  complianceItemService: { listItems: vi.fn() },
}));
vi.mock("./certification-review.service", () => ({
  certificationReviewService: { listCertificationReviewHistory: vi.fn() },
}));
vi.mock("./evidence.service", () => ({ listEvidence: vi.fn() }));

const projectRepository = await import("@/server/repositories/project.repository");
const requirementService = await import("./requirement.service");
const stakeholderNeedService = await import("./stakeholder-need.service");
const designItemService = await import("./design-item.service");
const verificationActivityService = await import("./verification-activity.service");
const engineeringDecisionService = await import("./engineering-decision.service");
const riskService = await import("./risk.service");
const issueService = await import("./issue.service");
const changeRequestService = await import("./change-request.service");
const supplierService = await import("./supplier.service");
const suppliedItemService = await import("./supplied-item.service");
const supplierQualificationService = await import("./supplier-qualification.service");
const { driftDetectionService } = await import("./drift-detection.service");
const { certificationProgramService } = await import("./certification-program.service");
const { certificationBasisService } = await import("./certification-basis.service");
const { complianceItemService } = await import("./compliance-item.service");
const { certificationReviewService } = await import("./certification-review.service");
const evidenceService = await import("./evidence.service");
const service = await import("./traceability.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaa";
const PROJECT = { id: PROJECT_ID, organizationId: CONTEXT.organizationId } as Project;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
});

describe("listSelectableRoots", () => {
  it("rejects a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(service.listSelectableRoots(CONTEXT, PROJECT_ID, "REQUIREMENT")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("rejects an unsupported or garbage node type", async () => {
    await expect(service.listSelectableRoots(CONTEXT, PROJECT_ID, "PROJECT")).rejects.toThrow(
      ValidationError,
    );
    await expect(service.listSelectableRoots(CONTEXT, PROJECT_ID, "not-a-type")).rejects.toThrow(
      ValidationError,
    );
  });

  it("dispatches REQUIREMENT to the requirement service and maps identifier/title", async () => {
    vi.mocked(requirementService.listRequirements).mockResolvedValue([
      { id: "r1", identifier: "REQ-001", title: "Fuel flow" } as never,
    ]);

    const result = await service.listSelectableRoots(CONTEXT, PROJECT_ID, "REQUIREMENT");

    expect(requirementService.listRequirements).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, {});
    expect(result).toEqual([{ id: "r1", identifier: "REQ-001", label: "Fuel flow" }]);
  });

  it("dispatches STAKEHOLDER_NEED", async () => {
    vi.mocked(stakeholderNeedService.listStakeholderNeeds).mockResolvedValue([
      { id: "n1", identifier: "SN-001", title: "Reduce fuel burn" } as never,
    ]);
    const result = await service.listSelectableRoots(CONTEXT, PROJECT_ID, "STAKEHOLDER_NEED");
    expect(result).toEqual([{ id: "n1", identifier: "SN-001", label: "Reduce fuel burn" }]);
  });

  it("dispatches EVIDENCE — a real listing and detail route added after this workspace was first built", async () => {
    vi.mocked(evidenceService.listEvidence).mockResolvedValue([
      { id: "ev1", identifier: "EV-001", title: "Hot fire test report" } as never,
    ]);
    const result = await service.listSelectableRoots(CONTEXT, PROJECT_ID, "EVIDENCE");
    expect(evidenceService.listEvidence).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, {});
    expect(result).toEqual([{ id: "ev1", identifier: "EV-001", label: "Hot fire test report" }]);
  });

  it("maps DESIGN_ITEM's `name` field to `label`", async () => {
    vi.mocked(designItemService.listDesignItems).mockResolvedValue([
      { id: "d1", identifier: "DI-001", name: "Wing assembly" } as never,
    ]);
    const result = await service.listSelectableRoots(CONTEXT, PROJECT_ID, "DESIGN_ITEM");
    expect(result).toEqual([{ id: "d1", identifier: "DI-001", label: "Wing assembly" }]);
  });

  it("dispatches VERIFICATION_ACTIVITY, ENGINEERING_DECISION, RISK, ISSUE, CHANGE_REQUEST", async () => {
    vi.mocked(verificationActivityService.listVerificationActivities).mockResolvedValue([
      { id: "v1", identifier: "VA-001", title: "Static test" } as never,
    ]);
    vi.mocked(engineeringDecisionService.listDecisions).mockResolvedValue([
      { id: "e1", identifier: "ED-001", title: "Material choice" } as never,
    ]);
    vi.mocked(riskService.listRisks).mockResolvedValue([
      { id: "rk1", identifier: "RSK-001", title: "Corrosion" } as never,
    ]);
    vi.mocked(issueService.listIssues).mockResolvedValue([
      { id: "is1", identifier: "ISS-001", title: "Sensor fault" } as never,
    ]);
    vi.mocked(changeRequestService.listChangeRequests).mockResolvedValue([
      { id: "c1", identifier: "CR-001", title: "Revise tolerance" } as never,
    ]);

    expect(await service.listSelectableRoots(CONTEXT, PROJECT_ID, "VERIFICATION_ACTIVITY")).toEqual([
      { id: "v1", identifier: "VA-001", label: "Static test" },
    ]);
    expect(await service.listSelectableRoots(CONTEXT, PROJECT_ID, "ENGINEERING_DECISION")).toEqual([
      { id: "e1", identifier: "ED-001", label: "Material choice" },
    ]);
    expect(await service.listSelectableRoots(CONTEXT, PROJECT_ID, "RISK")).toEqual([
      { id: "rk1", identifier: "RSK-001", label: "Corrosion" },
    ]);
    expect(await service.listSelectableRoots(CONTEXT, PROJECT_ID, "ISSUE")).toEqual([
      { id: "is1", identifier: "ISS-001", label: "Sensor fault" },
    ]);
    expect(await service.listSelectableRoots(CONTEXT, PROJECT_ID, "CHANGE_REQUEST")).toEqual([
      { id: "c1", identifier: "CR-001", label: "Revise tolerance" },
    ]);
  });

  it("maps SUPPLIER and SUPPLIED_ITEM's `name` field to `label`", async () => {
    vi.mocked(supplierService.listSuppliers).mockResolvedValue([
      { id: "s1", identifier: "SUP-001", name: "Acme Aero" } as never,
    ]);
    vi.mocked(suppliedItemService.listSuppliedItems).mockResolvedValue([
      { id: "si1", identifier: "SI-001", name: "Landing gear strut" } as never,
    ]);

    expect(await service.listSelectableRoots(CONTEXT, PROJECT_ID, "SUPPLIER")).toEqual([
      { id: "s1", identifier: "SUP-001", label: "Acme Aero" },
    ]);
    expect(await service.listSelectableRoots(CONTEXT, PROJECT_ID, "SUPPLIED_ITEM")).toEqual([
      { id: "si1", identifier: "SI-001", label: "Landing gear strut" },
    ]);
  });

  it("borrows a supplier qualification's identifier from its parent supplier", async () => {
    vi.mocked(supplierQualificationService.listSupplierQualifications).mockResolvedValue([
      {
        id: "q1",
        title: "Source approval",
        supplier: { id: "s1", identifier: "SUP-001", name: "Acme Aero" },
        suppliedItem: null,
      } as never,
    ]);

    const result = await service.listSelectableRoots(CONTEXT, PROJECT_ID, "SUPPLIER_QUALIFICATION");
    expect(result).toEqual([{ id: "q1", identifier: "SUP-001", label: "Source approval" }]);
  });

  it("dispatches ENGINEERING_BASELINE and OPERATIONAL_OBSERVATION without requiring a certification program", async () => {
    vi.mocked(driftDetectionService.listBaselines).mockResolvedValue([
      { id: "b1", identifier: "BSL-001", name: "PDR baseline" } as never,
    ]);
    vi.mocked(driftDetectionService.listObservations).mockResolvedValue([
      { id: "o1", identifier: "OBS-001", title: "Field report" } as never,
    ]);

    expect(await service.listSelectableRoots(CONTEXT, PROJECT_ID, "ENGINEERING_BASELINE")).toEqual([
      { id: "b1", identifier: "BSL-001", label: "PDR baseline" },
    ]);
    expect(await service.listSelectableRoots(CONTEXT, PROJECT_ID, "OPERATIONAL_OBSERVATION")).toEqual([
      { id: "o1", identifier: "OBS-001", label: "Field report" },
    ]);
    expect(certificationProgramService.getProgram).not.toHaveBeenCalled();
  });

  it("labels a drift assessment by status and timestamp, since it has no title", async () => {
    const evaluatedAt = new Date("2026-01-05T10:00:00.000Z");
    vi.mocked(driftDetectionService.listDriftHistory).mockResolvedValue([
      { id: "da1", status: "DRIFT_DETECTED", evaluatedAt } as never,
    ]);

    const result = await service.listSelectableRoots(CONTEXT, PROJECT_ID, "DRIFT_ASSESSMENT");
    expect(result).toEqual([
      { id: "da1", identifier: null, label: `DRIFT_DETECTED · ${evaluatedAt.toISOString()}` },
    ]);
  });

  it("returns an empty list for CERTIFICATION_BASIS/COMPLIANCE_ITEM/CERTIFICATION_REVIEW when there is no certification program yet", async () => {
    vi.mocked(certificationProgramService.getProgram).mockResolvedValue(null);

    expect(await service.listSelectableRoots(CONTEXT, PROJECT_ID, "CERTIFICATION_BASIS")).toEqual([]);
    expect(await service.listSelectableRoots(CONTEXT, PROJECT_ID, "COMPLIANCE_ITEM")).toEqual([]);
    expect(await service.listSelectableRoots(CONTEXT, PROJECT_ID, "CERTIFICATION_REVIEW")).toEqual([]);
    expect(certificationBasisService.listBases).not.toHaveBeenCalled();
  });

  it("dispatches CERTIFICATION_BASIS once a program exists", async () => {
    vi.mocked(certificationProgramService.getProgram).mockResolvedValue({ id: "prog1" } as never);
    vi.mocked(certificationBasisService.listBases).mockResolvedValue([
      { id: "cb1", identifier: "CB-001", title: "Part 25 basis" } as never,
    ]);

    const result = await service.listSelectableRoots(CONTEXT, PROJECT_ID, "CERTIFICATION_BASIS");
    expect(result).toEqual([{ id: "cb1", identifier: "CB-001", label: "Part 25 basis" }]);
  });

  it("aggregates COMPLIANCE_ITEM across every basis, not only the active one", async () => {
    vi.mocked(certificationProgramService.getProgram).mockResolvedValue({ id: "prog1" } as never);
    vi.mocked(certificationBasisService.listBases).mockResolvedValue([
      { id: "cb1" } as never,
      { id: "cb2" } as never,
    ]);
    vi.mocked(complianceItemService.listItems).mockImplementation(async (_ctx, _projectId, basisId) => {
      if (basisId === "cb1") return [{ id: "ci1", identifier: "CI-001", title: "25.1309" }] as never;
      return [{ id: "ci2", identifier: "CI-002", title: "25.601" }] as never;
    });

    const result = await service.listSelectableRoots(CONTEXT, PROJECT_ID, "COMPLIANCE_ITEM");
    expect(result).toEqual([
      { id: "ci1", identifier: "CI-001", label: "25.1309" },
      { id: "ci2", identifier: "CI-002", label: "25.601" },
    ]);
    expect(complianceItemService.listItems).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, "cb1");
    expect(complianceItemService.listItems).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, "cb2");
  });

  it("labels a certification review by status and timestamp, since it has no title", async () => {
    vi.mocked(certificationProgramService.getProgram).mockResolvedValue({ id: "prog1" } as never);
    const evaluatedAt = new Date("2026-02-01T00:00:00.000Z");
    vi.mocked(certificationReviewService.listCertificationReviewHistory).mockResolvedValue([
      { id: "rev1", status: "OPEN_FINDINGS", evaluatedAt } as never,
    ]);

    const result = await service.listSelectableRoots(CONTEXT, PROJECT_ID, "CERTIFICATION_REVIEW");
    expect(result).toEqual([
      { id: "rev1", identifier: null, label: `OPEN_FINDINGS · ${evaluatedAt.toISOString()}` },
    ]);
  });
});
