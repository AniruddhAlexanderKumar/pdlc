// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Evidence } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * Evidence service behavior against fake repositories: no database, no
 * Prisma. The transaction sentinel lets us assert that a mutation and its
 * audit event commit together. No test here ever asserts on a file upload or
 * a stored hash, because the service never accepts or computes one.
 */
const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/evidence.repository", () => ({
  createEvidence: vi.fn(),
  updateEvidence: vi.fn(),
  validateEvidence: vi.fn(),
  supersedeEvidence: vi.fn(),
  findEvidenceInProject: vi.fn(),
  findEvidenceDetail: vi.fn(),
  listEvidenceInProject: vi.fn(),
  listEvidenceLinks: vi.fn(),
  listFindingsCitingEvidence: vi.fn(),
  evidenceLinkTargetExistsInProject: vi.fn(),
  evidenceLinkExists: vi.fn(),
  createEvidenceLink: vi.fn(),
  deleteEvidenceLink: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

vi.mock("@/server/repositories/project-artifacts.repository", () => ({
  listEvidenceLinkTargets: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

const projectRepository = await import("@/server/repositories/project.repository");
const evidenceRepository = await import("@/server/repositories/evidence.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const service = await import("./evidence.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaa";
const EVIDENCE_ID = "ev1aaaaaaaaaaaaaaaaaaaaa";
const OTHER_EVIDENCE_ID = "ev2aaaaaaaaaaaaaaaaaaaaa";

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: EVIDENCE_ID,
    projectId: PROJECT_ID,
    identifier: "EV-001",
    title: "Hot fire test report",
    description: null,
    evidenceType: "TEST_RESULT",
    sourceReference: "TR-2026-014",
    status: "DRAFT",
    recordedById: CONTEXT.actorId,
    validatedById: null,
    validatedAt: null,
    supersededById: null,
    supersededAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue({
    id: PROJECT_ID,
  } as never);
  // CONTEXT's actor is a MANAGER on the project by default — full read/write/
  // approve/manage access, so existing tests exercising ordinary behavior do
  // not also need to set up a role scenario.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue({
    id: "mem1",
    projectId: PROJECT_ID,
    role: "MANAGER",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
  });
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
});

describe("createEvidence", () => {
  it("creates a DRAFT record scoped to the project, recorded by the actor", async () => {
    vi.mocked(evidenceRepository.createEvidence).mockResolvedValue(evidence());

    const created = await service.createEvidence(CONTEXT, PROJECT_ID, {
      identifier: "EV-001",
      title: "Hot fire test report",
      evidenceType: "TEST_RESULT",
      sourceReference: "TR-2026-014",
    });

    expect(created.status).toBe("DRAFT");
    expect(evidenceRepository.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ recordedById: CONTEXT.actorId, projectId: PROJECT_ID }),
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "evidence.created" }),
      TX,
    );
  });

  it("rejects invalid input before touching the repository", async () => {
    await expect(service.createEvidence(CONTEXT, PROJECT_ID, { title: "" })).rejects.toThrow(
      ValidationError,
    );
    expect(evidenceRepository.createEvidence).not.toHaveBeenCalled();
  });

  it("rejects an unknown field rather than silently dropping it", async () => {
    await expect(
      service.createEvidence(CONTEXT, PROJECT_ID, {
        identifier: "EV-001",
        title: "x",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-1",
        status: "VALIDATED",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("surfaces a duplicate identifier as a conflict", async () => {
    const { ConflictError: RepoConflict } = await import("@/server/errors");
    vi.mocked(evidenceRepository.createEvidence).mockRejectedValue(
      new RepoConflict("Evidence EV-001 already exists in this project."),
    );

    await expect(
      service.createEvidence(CONTEXT, PROJECT_ID, {
        identifier: "EV-001",
        title: "x",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-1",
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      service.createEvidence(CONTEXT, PROJECT_ID, {
        identifier: "EV-001",
        title: "x",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-1",
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("listEvidence", () => {
  it("lists evidence scoped to the project, with optional status/type filters", async () => {
    vi.mocked(evidenceRepository.listEvidenceInProject).mockResolvedValue([]);

    await service.listEvidence(CONTEXT, PROJECT_ID, { status: "DRAFT", evidenceType: "TEST_RESULT" });

    expect(evidenceRepository.listEvidenceInProject).toHaveBeenCalledWith(PROJECT_ID, {
      status: "DRAFT",
      evidenceType: "TEST_RESULT",
    });
  });

  it("rejects an invalid status filter", async () => {
    await expect(
      service.listEvidence(CONTEXT, PROJECT_ID, { status: "NOT_A_STATUS" }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("getEvidence", () => {
  it("returns full detail: recorder, validator, successor, links, citing findings, transitions, editability, history", async () => {
    vi.mocked(evidenceRepository.findEvidenceDetail).mockResolvedValue({
      ...evidence(),
      recordedBy: { id: "u1", name: "Ada", email: "ada@example.test" },
      validatedBy: null,
      supersededByRef: null,
    });
    vi.mocked(evidenceRepository.listEvidenceLinks).mockResolvedValue([]);
    vi.mocked(evidenceRepository.listFindingsCitingEvidence).mockResolvedValue([]);
    vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);

    const detail = await service.getEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID);

    expect(detail.availableTransitions).toEqual(["VALIDATED", "SUPERSEDED"]);
    expect(detail.editable).toEqual({ content: true, links: true });
    expect(detail.links).toEqual([]);
    expect(detail.citingFindings).toEqual([]);
  });

  it("404s for evidence in another project", async () => {
    vi.mocked(evidenceRepository.findEvidenceDetail).mockResolvedValue(null);

    await expect(service.getEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID)).rejects.toThrow(NotFoundError);
  });
});

describe("updateEvidence", () => {
  it("updates content while DRAFT", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());
    vi.mocked(evidenceRepository.updateEvidence).mockResolvedValue(evidence({ title: "Revised" }));

    const updated = await service.updateEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, {
      title: "Revised",
    });

    expect(updated.title).toBe("Revised");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "evidence.updated" }),
      TX,
    );
  });

  it("**refuses to edit VALIDATED evidence**", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(
      evidence({ status: "VALIDATED" }),
    );

    await expect(
      service.updateEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { title: "x" }),
    ).rejects.toThrow(ConflictError);
    expect(evidenceRepository.updateEvidence).not.toHaveBeenCalled();
  });

  it("**refuses to edit SUPERSEDED evidence**", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(
      evidence({ status: "SUPERSEDED" }),
    );

    await expect(
      service.updateEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { title: "x" }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects status through the content-update path", async () => {
    await expect(
      service.updateEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { status: "VALIDATED" }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("validateEvidence", () => {
  it("moves DRAFT to VALIDATED and audits it, attributed to the actor", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());
    vi.mocked(evidenceRepository.validateEvidence).mockResolvedValue(
      evidence({ status: "VALIDATED", validatedById: CONTEXT.actorId, validatedAt: new Date() }),
    );

    const validated = await service.validateEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, {});

    expect(validated.status).toBe("VALIDATED");
    expect(evidenceRepository.validateEvidence).toHaveBeenCalledWith(EVIDENCE_ID, CONTEXT.actorId, TX);
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "evidence.validated" }),
      TX,
    );
  });

  it("**refuses to validate already-VALIDATED evidence**", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(
      evidence({ status: "VALIDATED" }),
    );

    await expect(service.validateEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, {})).rejects.toThrow(
      ConflictError,
    );
  });

  it("**refuses to validate SUPERSEDED evidence**", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(
      evidence({ status: "SUPERSEDED" }),
    );

    await expect(service.validateEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, {})).rejects.toThrow(
      ConflictError,
    );
  });
});

describe("supersedeEvidence", () => {
  it("moves DRAFT to SUPERSEDED, recording the real replacement, without touching links", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockImplementation(async (_p, id) =>
      id === EVIDENCE_ID ? evidence() : evidence({ id: OTHER_EVIDENCE_ID, identifier: "EV-002" }),
    );
    vi.mocked(evidenceRepository.supersedeEvidence).mockResolvedValue(
      evidence({ status: "SUPERSEDED", supersededById: OTHER_EVIDENCE_ID, supersededAt: new Date() }),
    );

    const superseded = await service.supersedeEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, {
      newEvidenceId: OTHER_EVIDENCE_ID,
    });

    expect(superseded.status).toBe("SUPERSEDED");
    expect(superseded.supersededById).toBe(OTHER_EVIDENCE_ID);
    expect(evidenceRepository.supersedeEvidence).toHaveBeenCalledWith(
      EVIDENCE_ID,
      "DRAFT",
      OTHER_EVIDENCE_ID,
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "evidence.superseded" }),
      TX,
    );
  });

  it("moves VALIDATED to SUPERSEDED too", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockImplementation(async (_p, id) =>
      id === EVIDENCE_ID
        ? evidence({ status: "VALIDATED" })
        : evidence({ id: OTHER_EVIDENCE_ID, identifier: "EV-002" }),
    );
    vi.mocked(evidenceRepository.supersedeEvidence).mockResolvedValue(evidence({ status: "SUPERSEDED" }));

    await expect(
      service.supersedeEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { newEvidenceId: OTHER_EVIDENCE_ID }),
    ).resolves.toBeDefined();
  });

  it("**refuses to supersede already-SUPERSEDED evidence**", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(
      evidence({ status: "SUPERSEDED" }),
    );

    await expect(
      service.supersedeEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { newEvidenceId: OTHER_EVIDENCE_ID }),
    ).rejects.toThrow(ConflictError);
  });

  it("**rejects evidence superseding itself**", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());

    await expect(
      service.supersedeEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { newEvidenceId: EVIDENCE_ID }),
    ).rejects.toThrow(ValidationError);
    expect(evidenceRepository.supersedeEvidence).not.toHaveBeenCalled();
  });

  it("**rejects a replacement that does not exist in this project**", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockImplementation(async (_p, id) =>
      id === EVIDENCE_ID ? evidence() : null,
    );

    await expect(
      service.supersedeEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { newEvidenceId: OTHER_EVIDENCE_ID }),
    ).rejects.toThrow(NotFoundError);
  });

  it("**rejects a replacement that is itself already SUPERSEDED**", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockImplementation(async (_p, id) =>
      id === EVIDENCE_ID
        ? evidence()
        : evidence({ id: OTHER_EVIDENCE_ID, identifier: "EV-002", status: "SUPERSEDED" }),
    );

    await expect(
      service.supersedeEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { newEvidenceId: OTHER_EVIDENCE_ID }),
    ).rejects.toThrow(ValidationError);
  });

  it("never touches any EvidenceLink row when superseding", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockImplementation(async (_p, id) =>
      id === EVIDENCE_ID ? evidence() : evidence({ id: OTHER_EVIDENCE_ID, identifier: "EV-002" }),
    );
    vi.mocked(evidenceRepository.supersedeEvidence).mockResolvedValue(evidence({ status: "SUPERSEDED" }));

    await service.supersedeEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { newEvidenceId: OTHER_EVIDENCE_ID });

    expect(evidenceRepository.createEvidenceLink).not.toHaveBeenCalled();
    expect(evidenceRepository.deleteEvidenceLink).not.toHaveBeenCalled();
  });
});

describe("traceability", () => {
  it("adds a link and reads it back from the same transaction", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());
    vi.mocked(evidenceRepository.evidenceLinkTargetExistsInProject).mockResolvedValue(true);
    vi.mocked(evidenceRepository.evidenceLinkExists).mockResolvedValue(false);
    vi.mocked(evidenceRepository.createEvidenceLink).mockResolvedValue({ rowId: "row1" });
    vi.mocked(evidenceRepository.listEvidenceLinks).mockResolvedValue([
      {
        id: "REQUIREMENT:row1",
        relation: "REQUIREMENT",
        targetId: "req1",
        identifier: "REQ-001",
        title: "Chamber pressure",
        note: null,
        createdAt: new Date(),
      },
    ]);

    const link = await service.linkEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, {
      relation: "REQUIREMENT",
      targetId: "req1",
    });

    expect(link.targetId).toBe("req1");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "evidence.link_added" }),
      TX,
    );
  });

  it("**rejects a link to a target in another project**", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());
    vi.mocked(evidenceRepository.evidenceLinkTargetExistsInProject).mockResolvedValue(false);

    await expect(
      service.linkEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, {
        relation: "REQUIREMENT",
        targetId: "someone-elses-req",
      }),
    ).rejects.toThrow(ValidationError);
    expect(evidenceRepository.createEvidenceLink).not.toHaveBeenCalled();
  });

  it("rejects a duplicate link", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());
    vi.mocked(evidenceRepository.evidenceLinkTargetExistsInProject).mockResolvedValue(true);
    vi.mocked(evidenceRepository.evidenceLinkExists).mockResolvedValue(true);

    await expect(
      service.linkEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { relation: "REQUIREMENT", targetId: "req1" }),
    ).rejects.toThrow(ValidationError);
  });

  it("**refuses to link SUPERSEDED evidence**", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(
      evidence({ status: "SUPERSEDED" }),
    );

    await expect(
      service.linkEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { relation: "REQUIREMENT", targetId: "req1" }),
    ).rejects.toThrow(ConflictError);
  });

  it("still allows linking VALIDATED evidence — only content is frozen", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(
      evidence({ status: "VALIDATED" }),
    );
    vi.mocked(evidenceRepository.evidenceLinkTargetExistsInProject).mockResolvedValue(true);
    vi.mocked(evidenceRepository.evidenceLinkExists).mockResolvedValue(false);
    vi.mocked(evidenceRepository.createEvidenceLink).mockResolvedValue({ rowId: "row1" });
    vi.mocked(evidenceRepository.listEvidenceLinks).mockResolvedValue([
      {
        id: "REQUIREMENT:row1",
        relation: "REQUIREMENT",
        targetId: "req1",
        identifier: "REQ-001",
        title: "x",
        note: null,
        createdAt: new Date(),
      },
    ]);

    await expect(
      service.linkEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { relation: "REQUIREMENT", targetId: "req1" }),
    ).resolves.toBeDefined();
  });

  it("removes a link by its composite key and audits it", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());
    vi.mocked(evidenceRepository.deleteEvidenceLink).mockResolvedValue(1);

    await service.unlinkEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, "REQUIREMENT:row1");

    expect(evidenceRepository.deleteEvidenceLink).toHaveBeenCalledWith(EVIDENCE_ID, "row1", TX);
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "evidence.link_removed" }),
      TX,
    );
  });

  it("404s removing a link that does not exist", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());
    vi.mocked(evidenceRepository.deleteEvidenceLink).mockResolvedValue(0);

    await expect(
      service.unlinkEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, "REQUIREMENT:row1"),
    ).rejects.toThrow(NotFoundError);
  });

  it("400s an unparseable link id", async () => {
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());

    await expect(
      service.unlinkEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, "not-a-key"),
    ).rejects.toThrow(ValidationError);
  });

  it("never reaches the repository for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      service.linkEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, { relation: "REQUIREMENT", targetId: "req1" }),
    ).rejects.toThrow(NotFoundError);
    expect(evidenceRepository.createEvidenceLink).not.toHaveBeenCalled();
  });
});

describe("project role authorization", () => {
  function asRole(role: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER") {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue({
      id: "mem1",
      projectId: PROJECT_ID,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
    } as never);
  }

  it("refuses a VIEWER creating evidence", async () => {
    asRole("VIEWER");
    await expect(
      service.createEvidence(CONTEXT, PROJECT_ID, {
        identifier: "EV-001",
        title: "Hot fire test report",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-2026-014",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(evidenceRepository.createEvidence).not.toHaveBeenCalled();
  });

  it("allows an ENGINEER to create evidence but refuses them validating it — write authority is not approval authority", async () => {
    asRole("ENGINEER");
    vi.mocked(evidenceRepository.createEvidence).mockResolvedValue(evidence());
    await expect(
      service.createEvidence(CONTEXT, PROJECT_ID, {
        identifier: "EV-001",
        title: "Hot fire test report",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-2026-014",
      }),
    ).resolves.toMatchObject({ identifier: "EV-001" });

    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());
    await expect(
      service.validateEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, {}),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(evidenceRepository.validateEvidence).not.toHaveBeenCalled();
  });

  it("refuses an ENGINEER superseding evidence", async () => {
    asRole("ENGINEER");
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());

    await expect(
      service.supersedeEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, {
        newEvidenceId: OTHER_EVIDENCE_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a REVIEWER creating evidence — review authority is not write authority", async () => {
    asRole("REVIEWER");
    await expect(
      service.createEvidence(CONTEXT, PROJECT_ID, {
        identifier: "EV-001",
        title: "Hot fire test report",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-2026-014",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows a REVIEWER to validate evidence", async () => {
    asRole("REVIEWER");
    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());
    vi.mocked(evidenceRepository.validateEvidence).mockResolvedValue(
      evidence({ status: "VALIDATED" }),
    );

    await expect(
      service.validateEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, {}),
    ).resolves.toMatchObject({ status: "VALIDATED" });
  });

  it("allows a MANAGER to create and validate evidence", async () => {
    asRole("MANAGER");
    vi.mocked(evidenceRepository.createEvidence).mockResolvedValue(evidence());
    await expect(
      service.createEvidence(CONTEXT, PROJECT_ID, {
        identifier: "EV-001",
        title: "Hot fire test report",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-2026-014",
      }),
    ).resolves.toMatchObject({ identifier: "EV-001" });

    vi.mocked(evidenceRepository.findEvidenceInProject).mockResolvedValue(evidence());
    vi.mocked(evidenceRepository.validateEvidence).mockResolvedValue(
      evidence({ status: "VALIDATED" }),
    );
    await expect(
      service.validateEvidence(CONTEXT, PROJECT_ID, EVIDENCE_ID, {}),
    ).resolves.toMatchObject({ status: "VALIDATED" });
  });
});
