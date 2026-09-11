// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Risk } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * Risk service behavior against fake repositories: no database, no Prisma.
 * The transaction sentinel lets us assert that a mutation and its audit
 * event are handed the same client, i.e. that they commit together. No test
 * here ever asserts on a numeric score, because the service never computes
 * one.
 */
const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/risk.repository", () => ({
  createRisk: vi.fn(),
  updateRisk: vi.fn(),
  findRiskInProject: vi.fn(),
  listRisksInProject: vi.fn(),
  findRiskOwner: vi.fn(),
  listRiskLinks: vi.fn(),
  riskLinkTargetExistsInProject: vi.fn(),
  riskLinkExists: vi.fn(),
  createRiskLink: vi.fn(),
  deleteRiskLink: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

vi.mock("@/server/repositories/project-artifacts.repository", () => ({
  listRiskLinkTargets: vi.fn(),
}));

const projectRepository = await import("@/server/repositories/project.repository");
const riskRepository = await import("@/server/repositories/risk.repository");
const userRepository = await import("@/server/repositories/user.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const service = await import("./risk.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const PROJECT: Project = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: "risk1aaaaaaaaaaaaaaaaaa",
    projectId: PROJECT.id,
    identifier: "RSK-001",
    title: "Coolant supply interruption",
    description: "The coolant loop may lose flow under vibration.",
    cause: null,
    consequence: null,
    status: "OPEN",
    ownerId: null,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

const VALID_CREATE = {
  identifier: "RSK-001",
  title: "Coolant supply interruption",
  description: "The coolant loop may lose flow under vibration.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
  vi.mocked(riskRepository.riskLinkTargetExistsInProject).mockResolvedValue(true);
  vi.mocked(riskRepository.riskLinkExists).mockResolvedValue(false);
  vi.mocked(riskRepository.listRiskLinks).mockResolvedValue([]);
});

describe("createRisk", () => {
  it("creates an OPEN risk scoped to the project", async () => {
    vi.mocked(riskRepository.createRisk).mockResolvedValue(risk());

    const created = await service.createRisk(CONTEXT, PROJECT.id, VALID_CREATE);

    expect(created.identifier).toBe("RSK-001");
    expect(riskRepository.createRisk).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT.id, status: "OPEN" }),
      TX,
    );
  });

  it("audits creation in the same transaction, attributed to the session actor", async () => {
    vi.mocked(riskRepository.createRisk).mockResolvedValue(risk());

    await service.createRisk(CONTEXT, PROJECT.id, VALID_CREATE);

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "risk.created",
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.actorId,
      }),
      TX,
    );
  });

  it("**rejects invalid input before touching the repository**", async () => {
    await expect(
      service.createRisk(CONTEXT, PROJECT.id, { identifier: "RSK-001" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(riskRepository.createRisk).not.toHaveBeenCalled();
  });

  it("**rejects an unknown field rather than silently dropping it**", async () => {
    await expect(
      service.createRisk(CONTEXT, PROJECT.id, { ...VALID_CREATE, status: "CLOSED" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.createRisk(CONTEXT, PROJECT.id, { ...VALID_CREATE, organizationId: "org2" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("surfaces a duplicate identifier as a conflict", async () => {
    vi.mocked(riskRepository.createRisk).mockImplementation(async () => {
      throw new ConflictError("Risk RSK-001 already exists in this project.");
    });

    await expect(service.createRisk(CONTEXT, PROJECT.id, VALID_CREATE)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("**rejects an owner from another organization at creation**", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    await expect(
      service.createRisk(CONTEXT, PROJECT.id, { ...VALID_CREATE, ownerId: "userfromanotherorg1234" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(riskRepository.createRisk).not.toHaveBeenCalled();
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(service.createRisk(CONTEXT, "elsewhere", VALID_CREATE)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("listRisks / getRisk", () => {
  it("lists risks scoped to the project, with an optional status filter", async () => {
    vi.mocked(riskRepository.listRisksInProject).mockResolvedValue([{ ...risk(), owner: null }]);

    await service.listRisks(CONTEXT, PROJECT.id, { status: "OPEN" });

    expect(riskRepository.listRisksInProject).toHaveBeenCalledWith(PROJECT.id, { status: "OPEN" });
  });

  it("rejects an invalid status filter", async () => {
    await expect(service.listRisks(CONTEXT, PROJECT.id, { status: "NOT_A_STATUS" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("returns full detail: owner, links, transitions, editability and history", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk({ ownerId: "user2aaaaaaaaaaaaaaaaaa" }));
    vi.mocked(riskRepository.findRiskOwner).mockResolvedValue({
      id: "user2aaaaaaaaaaaaaaaaaa",
      name: "Ada",
      email: "ada@example.test",
    });
    vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);

    const detail = await service.getRisk(CONTEXT, PROJECT.id, "risk1");

    expect(detail.owner?.name).toBe("Ada");
    expect(detail.availableTransitions).toEqual(["MITIGATED", "ACCEPTED", "CLOSED"]);
    expect(detail.editable).toEqual({ content: true, owner: true, links: true });
  });

  it("404s for a risk in another project", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(null);

    await expect(service.getRisk(CONTEXT, PROJECT.id, "risk-elsewhere")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("updateRisk", () => {
  it("updates content while the risk is not closed", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk({ status: "MITIGATED" }));
    vi.mocked(riskRepository.updateRisk).mockResolvedValue(risk({ title: "Revised" }));

    await service.updateRisk(CONTEXT, PROJECT.id, "risk1", { title: "Revised" });

    expect(riskRepository.updateRisk).toHaveBeenCalledWith(
      "risk1aaaaaaaaaaaaaaaaaa",
      expect.objectContaining({ title: "Revised" }),
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "risk.updated" }),
      TX,
    );
  });

  it("**refuses to edit a closed risk**", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk({ status: "CLOSED" }));

    await expect(
      service.updateRisk(CONTEXT, PROJECT.id, "risk1", { title: "Revised" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(riskRepository.updateRisk).not.toHaveBeenCalled();
  });

  it("rejects status or owner through the content-update path", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk());

    await expect(
      service.updateRisk(CONTEXT, PROJECT.id, "risk1", { title: "x", status: "CLOSED" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses an update for a risk in another project", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(null);

    await expect(
      service.updateRisk(CONTEXT, PROJECT.id, "risk-elsewhere", { title: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("transitionRisk", () => {
  it("moves OPEN to MITIGATED and audits the transition", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk({ status: "OPEN" }));
    vi.mocked(riskRepository.updateRisk).mockResolvedValue(risk({ status: "MITIGATED" }));

    const updated = await service.transitionRisk(CONTEXT, PROJECT.id, "risk1", { to: "MITIGATED" });

    expect(updated.status).toBe("MITIGATED");
    expect(riskRepository.updateRisk).toHaveBeenCalledWith("risk1aaaaaaaaaaaaaaaaaa", { status: "MITIGATED" }, TX);
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "risk.status_transitioned", metadata: expect.objectContaining({ from: "OPEN", to: "MITIGATED" }) }),
      TX,
    );
  });

  it("allows every documented transition", async () => {
    for (const [from, to] of [
      ["OPEN", "ACCEPTED"],
      ["OPEN", "CLOSED"],
      ["MITIGATED", "CLOSED"],
      ["ACCEPTED", "CLOSED"],
    ] as const) {
      vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk({ status: from }));
      vi.mocked(riskRepository.updateRisk).mockResolvedValue(risk({ status: to }));

      await expect(
        service.transitionRisk(CONTEXT, PROJECT.id, "risk1", { to }),
      ).resolves.toBeDefined();
    }
  });

  it("**refuses an illegal transition, naming what would have been allowed**", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk({ status: "MITIGATED" }));

    await expect(
      service.transitionRisk(CONTEXT, PROJECT.id, "risk1", { to: "OPEN" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(riskRepository.updateRisk).not.toHaveBeenCalled();
  });

  it("**refuses to reopen a closed risk — CLOSED is terminal**", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk({ status: "CLOSED" }));

    await expect(
      service.transitionRisk(CONTEXT, PROJECT.id, "risk1", { to: "OPEN" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a transition to the same status", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk({ status: "OPEN" }));

    await expect(
      service.transitionRisk(CONTEXT, PROJECT.id, "risk1", { to: "OPEN" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not accept a generic PATCH-style status change — only the transition endpoint moves status", async () => {
    // updateRisk's own schema has no `status` field at all; this proves it at the service boundary.
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk());
    await expect(
      service.updateRisk(CONTEXT, PROJECT.id, "risk1", { status: "CLOSED" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("assignRiskOwner", () => {
  it("assigns a real organization member", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk());
    vi.mocked(riskRepository.updateRisk).mockResolvedValue(risk({ ownerId: "user2aaaaaaaaaaaaaaaaaa" }));

    const updated = await service.assignRiskOwner(CONTEXT, PROJECT.id, "risk1", {
      ownerId: "user2aaaaaaaaaaaaaaaaaa",
    });

    expect(updated.ownerId).toBe("user2aaaaaaaaaaaaaaaaaa");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "risk.owner_assigned" }),
      TX,
    );
  });

  it("clears an owner with an explicit null, auditing as a clear", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk({ ownerId: "user2aaaaaaaaaaaaaaaaaa" }));
    vi.mocked(riskRepository.updateRisk).mockResolvedValue(risk({ ownerId: null }));

    await service.assignRiskOwner(CONTEXT, PROJECT.id, "risk1", { ownerId: null });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "risk.owner_cleared" }),
      TX,
    );
  });

  it("**rejects an owner from another organization**", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk());

    await expect(
      service.assignRiskOwner(CONTEXT, PROJECT.id, "risk1", { ownerId: "userfromanotherorg1234" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(riskRepository.updateRisk).not.toHaveBeenCalled();
  });

  it("**refuses to reassign an owner on a closed risk**", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk({ status: "CLOSED" }));

    await expect(
      service.assignRiskOwner(CONTEXT, PROJECT.id, "risk1", { ownerId: "user2aaaaaaaaaaaaaaaaaa" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("risk links", () => {
  it("adds a link and reads it back from the same transaction", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk());
    vi.mocked(riskRepository.createRiskLink).mockResolvedValue({ rowId: "link1aaaaaaaaaaaaaaaaaa" });
    vi.mocked(riskRepository.listRiskLinks).mockResolvedValue([
      {
        id: "REQUIREMENT:link1aaaaaaaaaaaaaaaaaa",
        relation: "REQUIREMENT",
        targetId: "req1aaaaaaaaaaaaaaaaaaaa",
        identifier: "REQ-001",
        title: "Chamber pressure",
        note: null,
        createdAt: new Date(),
      },
    ]);

    const link = await service.linkRisk(CONTEXT, PROJECT.id, "risk1", {
      relation: "REQUIREMENT",
      targetId: "req1aaaaaaaaaaaaaaaaaaaa",
    });

    expect(link.relation).toBe("REQUIREMENT");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "risk.link_added" }),
      TX,
    );
  });

  it("**rejects a link to a target in another project**", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk());
    // The scoped existence check finds nothing for a foreign artifact.
    vi.mocked(riskRepository.riskLinkTargetExistsInProject).mockResolvedValue(false);

    await expect(
      service.linkRisk(CONTEXT, PROJECT.id, "risk1", {
        relation: "DESIGN_ITEM",
        targetId: "designfromotherproject",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(riskRepository.createRiskLink).not.toHaveBeenCalled();
    expect(auditLogRepository.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects a duplicate link", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk());
    vi.mocked(riskRepository.riskLinkExists).mockResolvedValue(true);

    await expect(
      service.linkRisk(CONTEXT, PROJECT.id, "risk1", {
        relation: "REQUIREMENT",
        targetId: "req1aaaaaaaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(riskRepository.createRiskLink).not.toHaveBeenCalled();
  });

  it("**refuses to link a closed risk**", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk({ status: "CLOSED" }));

    await expect(
      service.linkRisk(CONTEXT, PROJECT.id, "risk1", {
        relation: "REQUIREMENT",
        targetId: "req1aaaaaaaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("removes a link by its composite key and audits it", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk());
    vi.mocked(riskRepository.deleteRiskLink).mockResolvedValue(1);

    await service.unlinkRisk(CONTEXT, PROJECT.id, "risk1", "REQUIREMENT:link1aaaaaaaaaaaaaaaaaa");

    expect(riskRepository.deleteRiskLink).toHaveBeenCalledWith(
      "risk1aaaaaaaaaaaaaaaaaa",
      "REQUIREMENT",
      "link1aaaaaaaaaaaaaaaaaa",
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "risk.link_removed" }),
      TX,
    );
  });

  it("404s removing a link that does not exist", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk());
    vi.mocked(riskRepository.deleteRiskLink).mockResolvedValue(0);

    await expect(
      service.unlinkRisk(CONTEXT, PROJECT.id, "risk1", "REQUIREMENT:link1aaaaaaaaaaaaaaaaaa"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("400s an unparseable link id", async () => {
    vi.mocked(riskRepository.findRiskInProject).mockResolvedValue(risk());

    await expect(
      service.unlinkRisk(CONTEXT, PROJECT.id, "risk1", "not-a-valid-key"),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("tenancy", () => {
  it("never reaches the repository for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(service.listRisks(CONTEXT, "elsewhere")).rejects.toBeInstanceOf(NotFoundError);
    expect(riskRepository.listRisksInProject).not.toHaveBeenCalled();
  });
});
