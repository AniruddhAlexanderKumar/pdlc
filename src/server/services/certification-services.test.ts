// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CertificationBasis,
  CertificationFinding,
  CertificationProgram,
  ComplianceItem,
  Project,
} from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * Certification workspace service behaviour, against fake repositories: no
 * database, no Prisma.
 *
 * The property under test throughout is the same one every other engineering
 * service in this codebase is held to: **no id a caller supplies is ever
 * trusted**. A basis, an item, and every one of the eight link target types
 * are re-resolved inside the already-scoped project, inside the transaction,
 * before anything is written.
 *
 * The second property, unique to this capability, gets its own emphasis:
 * applicability, method, status and disposition are recorded **exactly** as
 * the request says and never derived from anything else — there is no branch
 * anywhere in these services that infers one from a linked artifact's state.
 */

const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/certification-program.repository", () => ({
  createProgram: vi.fn(),
  findProgramInProject: vi.fn(),
  findProgramById: vi.fn(),
  updateProgram: vi.fn(),
}));

vi.mock("@/server/repositories/certification-basis.repository", () => ({
  createBasis: vi.fn(),
  findBasisInProgram: vi.fn(),
  listBasesInProgram: vi.fn(),
  findActiveBasis: vi.fn(),
  updateBasis: vi.fn(),
  activateBasis: vi.fn(),
  supersedeBasis: vi.fn(),
}));

vi.mock("@/server/repositories/compliance-item.repository", () => ({
  createItem: vi.fn(),
  findItemInBasis: vi.fn(),
  findItemInProject: vi.fn(),
  listItemsInBasis: vi.fn(),
  updateItem: vi.fn(),
}));

vi.mock("@/server/repositories/compliance-link.repository", () => ({
  complianceLinkTargetExistsInProject: vi.fn(),
  complianceLinkExists: vi.fn(),
  createLink: vi.fn(),
  deleteLink: vi.fn(),
  listLinks: vi.fn(),
  loadReviewLinkage: vi.fn(),
}));

vi.mock("@/server/repositories/certification-finding.repository", () => ({
  createFinding: vi.fn(),
  findFindingInItem: vi.fn(),
  listFindingsForItem: vi.fn(),
  updateFinding: vi.fn(),
  dispositionFinding: vi.fn(),
  listOpenFindingsForItems: vi.fn(),
  listDispositionedFindingsForItems: vi.fn(),
}));

vi.mock("@/server/repositories/supplier-qualification.repository", () => ({
  evidenceExistsInProject: vi.fn(),
}));

vi.mock("@/server/repositories/project-artifacts.repository", () => ({
  listComplianceLinkTargets: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

const projectRepository = await import("@/server/repositories/project.repository");
const programRepository = await import("@/server/repositories/certification-program.repository");
const basisRepository = await import("@/server/repositories/certification-basis.repository");
const itemRepository = await import("@/server/repositories/compliance-item.repository");
const linkRepository = await import("@/server/repositories/compliance-link.repository");
const findingRepository = await import("@/server/repositories/certification-finding.repository");
const supplierQualificationRepository = await import(
  "@/server/repositories/supplier-qualification.repository"
);
const auditLogRepository = await import("@/server/repositories/audit-log.repository");

const { certificationProgramService } = await import("./certification-program.service");
const { certificationBasisService } = await import("./certification-basis.service");
const { complianceItemService } = await import("./compliance-item.service");
const { certificationFindingService } = await import("./certification-finding.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const PROJECT: Project = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Avionics",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const PROGRAM: CertificationProgram = {
  id: "prog1aaaaaaaaaaaaaaaaaa",
  projectId: PROJECT.id,
  identifier: "CERT-001",
  name: "Avionics certification effort",
  description: null,
  status: "DRAFT",
  ownerId: null,
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const BASIS: CertificationBasis = {
  id: "basis1aaaaaaaaaaaaaaaaa",
  certificationProgramId: PROGRAM.id,
  identifier: "CB-001",
  title: "Part 25 Amdt 25-141",
  description: null,
  revision: "Amdt 25-141",
  sourceReference: "FAA 14 CFR Part 25",
  status: "DRAFT",
  supersededById: null,
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
};

const ACTIVE_BASIS: CertificationBasis = { ...BASIS, id: "basis2aaaaaaaaaaaaaaaaa", status: "ACTIVE" };

const ITEM: ComplianceItem = {
  id: "item1aaaaaaaaaaaaaaaaaa",
  certificationBasisId: BASIS.id,
  identifier: "CI-001",
  title: "Cabin pressurization limits",
  description: null,
  applicability: "UNDETERMINED",
  applicabilityRationale: null,
  applicabilityReviewerId: null,
  applicabilityReviewedAt: null,
  method: null,
  status: "OPEN",
  disposition: "UNASSESSED",
  createdAt: new Date("2026-01-04T00:00:00.000Z"),
  updatedAt: new Date("2026-01-04T00:00:00.000Z"),
};

const FINDING: CertificationFinding = {
  id: "find1aaaaaaaaaaaaaaaaaa",
  complianceItemId: ITEM.id,
  identifier: "CF-001",
  title: "Missing analysis report",
  description: null,
  severity: "HIGH",
  status: "OPEN",
  resolutionNote: null,
  evidenceId: null,
  resolvedAt: null,
  resolvedById: null,
  createdAt: new Date("2026-01-05T00:00:00.000Z"),
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(auditLogRepository.recordAuditEvent).mockResolvedValue(undefined as never);
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);
});

// --- CertificationProgramService ---------------------------------------------

describe("CertificationProgramService.createProgram", () => {
  it("creates the programme and audits it on the same transaction", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(null);
    vi.mocked(programRepository.createProgram).mockResolvedValue(PROGRAM);

    const created = await certificationProgramService.createProgram(CONTEXT, PROJECT.id, {
      identifier: "CERT-001",
      name: "Avionics certification effort",
    });

    expect(created).toEqual(PROGRAM);
    expect(programRepository.createProgram).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT.id, identifier: "CERT-001" }),
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "certification_program.created", entityType: "CertificationProgram" }),
      TX,
    );
  });

  it("refuses a second programme for the same project — exactly one per project", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);

    await expect(
      certificationProgramService.createProgram(CONTEXT, PROJECT.id, {
        identifier: "CERT-002",
        name: "A second effort",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(programRepository.createProgram).not.toHaveBeenCalled();
  });

  it("refuses a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      certificationProgramService.createProgram(CONTEXT, "other-project", {
        identifier: "CERT-001",
        name: "x",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("CertificationProgramService.updateProgram", () => {
  it("refuses an illegal status transition", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue({ ...PROGRAM, status: "CLOSED" });

    await expect(
      certificationProgramService.updateProgram(CONTEXT, PROJECT.id, { status: "ACTIVE" }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(programRepository.updateProgram).not.toHaveBeenCalled();
  });

  it("allows DRAFT -> ACTIVE and audits the change", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(programRepository.updateProgram).mockResolvedValue({ ...PROGRAM, status: "ACTIVE" });

    const updated = await certificationProgramService.updateProgram(CONTEXT, PROJECT.id, { status: "ACTIVE" });

    expect(updated.status).toBe("ACTIVE");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "certification_program.updated" }),
      TX,
    );
  });
});

// --- CertificationBasisService -----------------------------------------------

describe("CertificationBasisService.createBasis", () => {
  it("creates the basis under the project's programme", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.createBasis).mockResolvedValue(BASIS);

    const created = await certificationBasisService.createBasis(CONTEXT, PROJECT.id, {
      identifier: "CB-001",
      title: "Part 25 Amdt 25-141",
      revision: "Amdt 25-141",
    });

    expect(created).toEqual(BASIS);
    expect(basisRepository.createBasis).toHaveBeenCalledWith(
      expect.objectContaining({ certificationProgramId: PROGRAM.id, createdById: CONTEXT.actorId }),
      TX,
    );
  });

  it("requires a certification programme to exist first", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(null);

    await expect(
      certificationBasisService.createBasis(CONTEXT, PROJECT.id, {
        identifier: "CB-001",
        title: "x",
        revision: "1",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("CertificationBasisService.updateBasis", () => {
  it("refuses to edit a basis once it is ACTIVE", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findBasisInProgram).mockResolvedValue(ACTIVE_BASIS);

    await expect(
      certificationBasisService.updateBasis(CONTEXT, PROJECT.id, ACTIVE_BASIS.id, { title: "New title" }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(basisRepository.updateBasis).not.toHaveBeenCalled();
  });

  it("allows editing a DRAFT basis", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findBasisInProgram).mockResolvedValue(BASIS);
    vi.mocked(basisRepository.updateBasis).mockResolvedValue({ ...BASIS, title: "New title" });

    const updated = await certificationBasisService.updateBasis(CONTEXT, PROJECT.id, BASIS.id, {
      title: "New title",
    });

    expect(updated.title).toBe("New title");
  });
});

describe("CertificationBasisService.activateBasis", () => {
  it("activates a lone DRAFT basis with no supersession needed", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findBasisInProgram).mockResolvedValue(BASIS);
    vi.mocked(basisRepository.findActiveBasis).mockResolvedValue(null);
    vi.mocked(basisRepository.activateBasis).mockResolvedValue({ ...BASIS, status: "ACTIVE" });

    const activated = await certificationBasisService.activateBasis(CONTEXT, PROJECT.id, BASIS.id, {});

    expect(activated.status).toBe("ACTIVE");
    expect(basisRepository.supersedeBasis).not.toHaveBeenCalled();
  });

  it("refuses to activate while another basis is ACTIVE, without supersedeActive", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findBasisInProgram).mockResolvedValue(BASIS);
    vi.mocked(basisRepository.findActiveBasis).mockResolvedValue(ACTIVE_BASIS);

    await expect(
      certificationBasisService.activateBasis(CONTEXT, PROJECT.id, BASIS.id, {}),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(basisRepository.activateBasis).not.toHaveBeenCalled();
  });

  it("supersedes the existing active basis explicitly when supersedeActive is set", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findBasisInProgram).mockResolvedValue(BASIS);
    vi.mocked(basisRepository.findActiveBasis).mockResolvedValue(ACTIVE_BASIS);
    vi.mocked(basisRepository.supersedeBasis).mockResolvedValue({ ...ACTIVE_BASIS, status: "SUPERSEDED" });
    vi.mocked(basisRepository.activateBasis).mockResolvedValue({ ...BASIS, status: "ACTIVE" });

    const activated = await certificationBasisService.activateBasis(CONTEXT, PROJECT.id, BASIS.id, {
      supersedeActive: true,
    });

    expect(activated.status).toBe("ACTIVE");
    expect(basisRepository.supersedeBasis).toHaveBeenCalledWith(ACTIVE_BASIS.id, BASIS.id, TX);
  });

  it("refuses to reactivate an already-SUPERSEDED basis", async () => {
    const superseded = { ...BASIS, status: "SUPERSEDED" as const };
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findBasisInProgram).mockResolvedValue(superseded);

    await expect(
      certificationBasisService.activateBasis(CONTEXT, PROJECT.id, superseded.id, {}),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// --- ComplianceItemService ----------------------------------------------------

describe("ComplianceItemService.createItem", () => {
  it("defaults to the programme's active basis when none is given", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findActiveBasis).mockResolvedValue(ACTIVE_BASIS);
    vi.mocked(itemRepository.createItem).mockResolvedValue({ ...ITEM, certificationBasisId: ACTIVE_BASIS.id });

    const created = await complianceItemService.createItem(CONTEXT, PROJECT.id, undefined, {
      identifier: "CI-001",
      title: "Cabin pressurization limits",
    });

    expect(created.certificationBasisId).toBe(ACTIVE_BASIS.id);
    expect(itemRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ certificationBasisId: ACTIVE_BASIS.id }),
      TX,
    );
  });

  it("refuses to create an item when the programme has no active basis and none was named", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findActiveBasis).mockResolvedValue(null);

    await expect(
      complianceItemService.createItem(CONTEXT, PROJECT.id, undefined, {
        identifier: "CI-001",
        title: "x",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(itemRepository.createItem).not.toHaveBeenCalled();
  });

  it("creates against a named DRAFT basis explicitly", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findBasisInProgram).mockResolvedValue(BASIS);
    vi.mocked(itemRepository.createItem).mockResolvedValue(ITEM);

    const created = await complianceItemService.createItem(CONTEXT, PROJECT.id, BASIS.id, {
      identifier: "CI-001",
      title: "Cabin pressurization limits",
    });

    expect(created).toEqual(ITEM);
  });

  it("refuses to add items to a SUPERSEDED basis", async () => {
    const superseded = { ...BASIS, status: "SUPERSEDED" as const };
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findBasisInProgram).mockResolvedValue(superseded);

    await expect(
      complianceItemService.createItem(CONTEXT, PROJECT.id, superseded.id, {
        identifier: "CI-001",
        title: "x",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("ComplianceItemService.updateItem — applicability is never derived", () => {
  it("records applicability exactly as sent, stamping the reviewer and timestamp from context", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(itemRepository.updateItem).mockResolvedValue({
      ...ITEM,
      applicability: "APPLICABLE",
      applicabilityRationale: "Cabin altitude limits apply to this configuration.",
      applicabilityReviewerId: CONTEXT.actorId,
    });

    await complianceItemService.updateItem(CONTEXT, PROJECT.id, ITEM.id, {
      applicability: "APPLICABLE",
      applicabilityRationale: "Cabin altitude limits apply to this configuration.",
    });

    expect(itemRepository.updateItem).toHaveBeenCalledWith(
      ITEM.id,
      expect.objectContaining({
        applicability: "APPLICABLE",
        applicabilityReviewerId: CONTEXT.actorId,
      }),
      TX,
    );
  });

  it("leaves disposition untouched when only status is patched", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(itemRepository.updateItem).mockResolvedValue({ ...ITEM, status: "IN_PROGRESS" });

    await complianceItemService.updateItem(CONTEXT, PROJECT.id, ITEM.id, { status: "IN_PROGRESS" });

    const patch = vi.mocked(itemRepository.updateItem).mock.calls[0]?.[1];
    expect(patch).not.toHaveProperty("disposition");
    expect(patch).not.toHaveProperty("applicability");
  });

  it("resolves the item by walking up through its basis and programme to the project — cross-project ids never resolve", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(null);

    await expect(
      complianceItemService.updateItem(CONTEXT, PROJECT.id, "someone-elses-item", { status: "CLOSED" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(itemRepository.findItemInProject).toHaveBeenCalledWith(PROJECT.id, "someone-elses-item", TX);
  });
});

describe("ComplianceItemService.addLink", () => {
  it("re-resolves the target inside the project before linking", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(linkRepository.complianceLinkTargetExistsInProject).mockResolvedValue(true);
    vi.mocked(linkRepository.complianceLinkExists).mockResolvedValue(false);
    vi.mocked(linkRepository.createLink).mockResolvedValue({ rowId: "link1" });
    vi.mocked(linkRepository.listLinks).mockResolvedValue([
      {
        id: "REQUIREMENT:link1",
        complianceItemId: ITEM.id,
        linkType: "REQUIREMENT",
        targetId: "req1aaaaaaaaaaaaaaaaaaa",
        targetIdentifier: "REQ-001",
        targetLabel: "Cabin pressurization",
        note: null,
        createdAt: new Date(),
        createdById: CONTEXT.actorId,
      },
    ]);

    const link = await complianceItemService.addLink(CONTEXT, PROJECT.id, ITEM.id, {
      linkType: "REQUIREMENT",
      targetId: "req1aaaaaaaaaaaaaaaaaaa",
    });

    expect(link.linkType).toBe("REQUIREMENT");
    expect(linkRepository.complianceLinkTargetExistsInProject).toHaveBeenCalledWith(
      "REQUIREMENT",
      "req1aaaaaaaaaaaaaaaaaaa",
      PROJECT.id,
      TX,
    );
  });

  it("refuses a target that does not exist in this project", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(linkRepository.complianceLinkTargetExistsInProject).mockResolvedValue(false);

    await expect(
      complianceItemService.addLink(CONTEXT, PROJECT.id, ITEM.id, {
        linkType: "REQUIREMENT",
        targetId: "another-projects-requirement",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(linkRepository.createLink).not.toHaveBeenCalled();
  });

  it("refuses a duplicate link", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(linkRepository.complianceLinkTargetExistsInProject).mockResolvedValue(true);
    vi.mocked(linkRepository.complianceLinkExists).mockResolvedValue(true);

    await expect(
      complianceItemService.addLink(CONTEXT, PROJECT.id, ITEM.id, {
        linkType: "REQUIREMENT",
        targetId: "req1aaaaaaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(linkRepository.createLink).not.toHaveBeenCalled();
  });
});

describe("ComplianceItemService.removeLink", () => {
  it("rejects a malformed link id before touching the database", async () => {
    await expect(
      complianceItemService.removeLink(CONTEXT, PROJECT.id, ITEM.id, "not-a-composite-key"),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(linkRepository.deleteLink).not.toHaveBeenCalled();
  });

  it("deletes from exactly the table the link type names", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(linkRepository.deleteLink).mockResolvedValue(true);

    await complianceItemService.removeLink(CONTEXT, PROJECT.id, ITEM.id, "REQUIREMENT:link1");

    expect(linkRepository.deleteLink).toHaveBeenCalledWith(ITEM.id, "REQUIREMENT", "link1", TX);
  });

  it("reports not-found when the row is already gone", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(linkRepository.deleteLink).mockResolvedValue(false);

    await expect(
      complianceItemService.removeLink(CONTEXT, PROJECT.id, ITEM.id, "REQUIREMENT:link1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// --- CertificationFindingService ----------------------------------------------

describe("CertificationFindingService.createFinding", () => {
  it("creates a finding against the resolved item", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(findingRepository.createFinding).mockResolvedValue(FINDING);

    const created = await certificationFindingService.createFinding(CONTEXT, PROJECT.id, ITEM.id, {
      identifier: "CF-001",
      title: "Missing analysis report",
      severity: "HIGH",
    });

    expect(created).toEqual(FINDING);
    expect(findingRepository.createFinding).toHaveBeenCalledWith(
      expect.objectContaining({ complianceItemId: ITEM.id, severity: "HIGH" }),
      TX,
    );
  });
});

describe("CertificationFindingService.resolveFinding / acceptFinding", () => {
  it("resolving stamps the note, actor and timestamp — never accepts a client-supplied resolvedById", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(findingRepository.findFindingInItem).mockResolvedValue(FINDING);
    vi.mocked(findingRepository.dispositionFinding).mockResolvedValue({
      ...FINDING,
      status: "RESOLVED",
      resolutionNote: "Analysis report filed.",
      resolvedById: CONTEXT.actorId,
      resolvedAt: new Date(),
    });

    const resolved = await certificationFindingService.resolveFinding(CONTEXT, PROJECT.id, ITEM.id, FINDING.id, {
      note: "Analysis report filed.",
    });

    expect(resolved.status).toBe("RESOLVED");
    expect(findingRepository.dispositionFinding).toHaveBeenCalledWith(
      FINDING.id,
      "RESOLVED",
      "Analysis report filed.",
      null,
      CONTEXT.actorId,
      TX,
    );
  });

  it("accepting requires the same note discipline and produces ACCEPTED, not RESOLVED", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(findingRepository.findFindingInItem).mockResolvedValue(FINDING);
    vi.mocked(findingRepository.dispositionFinding).mockResolvedValue({
      ...FINDING,
      status: "ACCEPTED",
      resolutionNote: "Accepted as a known limitation.",
      resolvedById: CONTEXT.actorId,
      resolvedAt: new Date(),
    });

    const accepted = await certificationFindingService.acceptFinding(CONTEXT, PROJECT.id, ITEM.id, FINDING.id, {
      note: "Accepted as a known limitation.",
    });

    expect(accepted.status).toBe("ACCEPTED");
    expect(findingRepository.dispositionFinding).toHaveBeenCalledWith(
      FINDING.id,
      "ACCEPTED",
      "Accepted as a known limitation.",
      null,
      CONTEXT.actorId,
      TX,
    );
  });

  it("validates a supplied evidenceId exists in the project before attaching it", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(findingRepository.findFindingInItem).mockResolvedValue(FINDING);
    vi.mocked(supplierQualificationRepository.evidenceExistsInProject).mockResolvedValue(false);

    await expect(
      certificationFindingService.resolveFinding(CONTEXT, PROJECT.id, ITEM.id, FINDING.id, {
        note: "Fixed.",
        evidenceId: "another-projects-evidence",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(findingRepository.dispositionFinding).not.toHaveBeenCalled();
  });

  it("refuses to re-dispose a finding that is already RESOLVED or ACCEPTED", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(findingRepository.findFindingInItem).mockResolvedValue({ ...FINDING, status: "RESOLVED" });

    await expect(
      certificationFindingService.acceptFinding(CONTEXT, PROJECT.id, ITEM.id, FINDING.id, { note: "x" }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(findingRepository.dispositionFinding).not.toHaveBeenCalled();
  });

  it("never exposes a delete — there is no such method on the service", () => {
    expect((certificationFindingService as unknown as Record<string, unknown>)["deleteFinding"]).toBeUndefined();
  });
});
