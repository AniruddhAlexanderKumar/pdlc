// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Issue, Project } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * Issue service behavior against fake repositories: no database, no Prisma.
 * The transaction sentinel lets us assert that a mutation and its audit
 * event are handed the same client, i.e. that they commit together. No test
 * here ever asserts on a numeric score — severity is the only classification
 * this domain records, and it is recorded exactly as a person set it.
 */
const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/issue.repository", () => ({
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  findIssueInProject: vi.fn(),
  listIssuesInProject: vi.fn(),
  findIssueOwner: vi.fn(),
  listIssueLinks: vi.fn(),
  issueLinkTargetExistsInProject: vi.fn(),
  issueLinkExists: vi.fn(),
  createIssueLink: vi.fn(),
  deleteIssueLink: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

vi.mock("@/server/repositories/project-artifacts.repository", () => ({
  listIssueLinkTargets: vi.fn(),
}));

const projectRepository = await import("@/server/repositories/project.repository");
const issueRepository = await import("@/server/repositories/issue.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const service = await import("./issue.service");

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

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue1aaaaaaaaaaaaaaaa",
    projectId: PROJECT.id,
    identifier: "ISS-001",
    title: "Chamber wall crack found",
    description: "A hairline crack was found during post-test inspection.",
    severity: "HIGH",
    status: "OPEN",
    ownerId: null,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

const VALID_CREATE = {
  identifier: "ISS-001",
  title: "Chamber wall crack found",
  description: "A hairline crack was found during post-test inspection.",
  severity: "HIGH" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
  vi.mocked(issueRepository.issueLinkTargetExistsInProject).mockResolvedValue(true);
  vi.mocked(issueRepository.issueLinkExists).mockResolvedValue(false);
  vi.mocked(issueRepository.listIssueLinks).mockResolvedValue([]);
  // CONTEXT's actor is a MANAGER on PROJECT by default — full read/write/
  // approve/manage access, so existing tests exercising ordinary behavior
  // do not also need to set up a role scenario.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue({
    id: "mem1",
    projectId: PROJECT.id,
    role: "MANAGER",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
  });
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
});

describe("createIssue", () => {
  it("creates an OPEN issue scoped to the project", async () => {
    vi.mocked(issueRepository.createIssue).mockResolvedValue(issue());

    const created = await service.createIssue(CONTEXT, PROJECT.id, VALID_CREATE);

    expect(created.identifier).toBe("ISS-001");
    expect(issueRepository.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT.id, status: "OPEN", severity: "HIGH" }),
      TX,
    );
  });

  it("audits creation in the same transaction, attributed to the session actor", async () => {
    vi.mocked(issueRepository.createIssue).mockResolvedValue(issue());

    await service.createIssue(CONTEXT, PROJECT.id, VALID_CREATE);

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "issue.created",
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.actorId,
      }),
      TX,
    );
  });

  it("**rejects invalid input before touching the repository**", async () => {
    await expect(
      service.createIssue(CONTEXT, PROJECT.id, { identifier: "ISS-001" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(issueRepository.createIssue).not.toHaveBeenCalled();
  });

  it("requires severity — it is not optional", async () => {
    const { severity: _severity, ...withoutSeverity } = VALID_CREATE;
    await expect(
      service.createIssue(CONTEXT, PROJECT.id, withoutSeverity),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("**rejects an unknown field rather than silently dropping it**", async () => {
    await expect(
      service.createIssue(CONTEXT, PROJECT.id, { ...VALID_CREATE, status: "CLOSED" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("surfaces a duplicate identifier as a conflict", async () => {
    vi.mocked(issueRepository.createIssue).mockImplementation(async () => {
      throw new ConflictError("Issue ISS-001 already exists in this project.");
    });

    await expect(service.createIssue(CONTEXT, PROJECT.id, VALID_CREATE)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("**rejects an owner from another organization at creation**", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    await expect(
      service.createIssue(CONTEXT, PROJECT.id, { ...VALID_CREATE, ownerId: "userfromanotherorg1234" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(issueRepository.createIssue).not.toHaveBeenCalled();
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(service.createIssue(CONTEXT, "elsewhere", VALID_CREATE)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("listIssues / getIssue", () => {
  it("lists issues scoped to the project, with status and severity filters", async () => {
    vi.mocked(issueRepository.listIssuesInProject).mockResolvedValue([{ ...issue(), owner: null }]);

    await service.listIssues(CONTEXT, PROJECT.id, { status: "OPEN", severity: "HIGH" });

    expect(issueRepository.listIssuesInProject).toHaveBeenCalledWith(PROJECT.id, {
      status: "OPEN",
      severity: "HIGH",
    });
  });

  it("rejects an invalid status or severity filter", async () => {
    await expect(
      service.listIssues(CONTEXT, PROJECT.id, { status: "NOT_A_STATUS" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.listIssues(CONTEXT, PROJECT.id, { severity: "EXTREME" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns full detail: owner, links, transitions, editability and history", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(
      issue({ ownerId: "user2aaaaaaaaaaaaaaaaaa" }),
    );
    vi.mocked(issueRepository.findIssueOwner).mockResolvedValue({
      id: "user2aaaaaaaaaaaaaaaaaa",
      name: "Ada",
      email: "ada@example.test",
    });
    vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);

    const detail = await service.getIssue(CONTEXT, PROJECT.id, "issue1");

    expect(detail.owner?.name).toBe("Ada");
    expect(detail.availableTransitions).toEqual(["IN_PROGRESS", "RESOLVED"]);
    expect(detail.editable).toEqual({ content: true, owner: true, links: true });
  });

  it("404s for an issue in another project", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(null);

    await expect(service.getIssue(CONTEXT, PROJECT.id, "issue-elsewhere")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("updateIssue", () => {
  it("updates content while OPEN or IN_PROGRESS", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue({ status: "IN_PROGRESS" }));
    vi.mocked(issueRepository.updateIssue).mockResolvedValue(issue({ title: "Revised" }));

    await service.updateIssue(CONTEXT, PROJECT.id, "issue1", { title: "Revised" });

    expect(issueRepository.updateIssue).toHaveBeenCalledWith(
      "issue1aaaaaaaaaaaaaaaa",
      expect.objectContaining({ title: "Revised" }),
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "issue.updated" }),
      TX,
    );
  });

  it("**refuses to edit a resolved issue — there is no closure-note carve-out**", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue({ status: "RESOLVED" }));

    await expect(
      service.updateIssue(CONTEXT, PROJECT.id, "issue1", { title: "Revised" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(issueRepository.updateIssue).not.toHaveBeenCalled();
  });

  it("**refuses to edit a closed issue**", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue({ status: "CLOSED" }));

    await expect(
      service.updateIssue(CONTEXT, PROJECT.id, "issue1", { title: "Revised" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects status or owner through the content-update path", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue());

    await expect(
      service.updateIssue(CONTEXT, PROJECT.id, "issue1", { title: "x", status: "CLOSED" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses an update for an issue in another project", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(null);

    await expect(
      service.updateIssue(CONTEXT, PROJECT.id, "issue-elsewhere", { title: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("transitionIssue", () => {
  it("moves OPEN to IN_PROGRESS and audits the transition", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue({ status: "OPEN" }));
    vi.mocked(issueRepository.updateIssue).mockResolvedValue(issue({ status: "IN_PROGRESS" }));

    const updated = await service.transitionIssue(CONTEXT, PROJECT.id, "issue1", { to: "IN_PROGRESS" });

    expect(updated.status).toBe("IN_PROGRESS");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "issue.status_transitioned",
        metadata: expect.objectContaining({ from: "OPEN", to: "IN_PROGRESS" }),
      }),
      TX,
    );
  });

  it("allows every documented transition, including OPEN straight to RESOLVED", async () => {
    for (const [from, to] of [
      ["OPEN", "RESOLVED"],
      ["IN_PROGRESS", "RESOLVED"],
      ["RESOLVED", "CLOSED"],
    ] as const) {
      vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue({ status: from }));
      vi.mocked(issueRepository.updateIssue).mockResolvedValue(issue({ status: to }));

      await expect(
        service.transitionIssue(CONTEXT, PROJECT.id, "issue1", { to }),
      ).resolves.toBeDefined();
    }
  });

  it("**refuses IN_PROGRESS jumping straight to CLOSED**", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue({ status: "IN_PROGRESS" }));

    await expect(
      service.transitionIssue(CONTEXT, PROJECT.id, "issue1", { to: "CLOSED" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(issueRepository.updateIssue).not.toHaveBeenCalled();
  });

  it("**refuses to reopen a closed issue — CLOSED is terminal**", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue({ status: "CLOSED" }));

    await expect(
      service.transitionIssue(CONTEXT, PROJECT.id, "issue1", { to: "OPEN" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a transition to the same status", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue({ status: "OPEN" }));

    await expect(
      service.transitionIssue(CONTEXT, PROJECT.id, "issue1", { to: "OPEN" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not accept a generic PATCH-style status change — only the transition endpoint moves status", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue());
    await expect(
      service.updateIssue(CONTEXT, PROJECT.id, "issue1", { status: "CLOSED" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("assignIssueOwner", () => {
  it("assigns a real organization member", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue());
    vi.mocked(issueRepository.updateIssue).mockResolvedValue(issue({ ownerId: "user2aaaaaaaaaaaaaaaaaa" }));

    const updated = await service.assignIssueOwner(CONTEXT, PROJECT.id, "issue1", {
      ownerId: "user2aaaaaaaaaaaaaaaaaa",
    });

    expect(updated.ownerId).toBe("user2aaaaaaaaaaaaaaaaaa");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "issue.owner_assigned" }),
      TX,
    );
  });

  it("clears an owner with an explicit null, auditing as a clear", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(
      issue({ ownerId: "user2aaaaaaaaaaaaaaaaaa" }),
    );
    vi.mocked(issueRepository.updateIssue).mockResolvedValue(issue({ ownerId: null }));

    await service.assignIssueOwner(CONTEXT, PROJECT.id, "issue1", { ownerId: null });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "issue.owner_cleared" }),
      TX,
    );
  });

  it("**rejects an owner from another organization**", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue());

    await expect(
      service.assignIssueOwner(CONTEXT, PROJECT.id, "issue1", { ownerId: "userfromanotherorg1234" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(issueRepository.updateIssue).not.toHaveBeenCalled();
  });

  it("still allows reassigning an owner on a RESOLVED issue (frozen only at CLOSED)", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue({ status: "RESOLVED" }));
    vi.mocked(issueRepository.updateIssue).mockResolvedValue(
      issue({ status: "RESOLVED", ownerId: "user2aaaaaaaaaaaaaaaaaa" }),
    );

    await expect(
      service.assignIssueOwner(CONTEXT, PROJECT.id, "issue1", { ownerId: "user2aaaaaaaaaaaaaaaaaa" }),
    ).resolves.toBeDefined();
  });

  it("**refuses to reassign an owner on a closed issue**", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue({ status: "CLOSED" }));

    await expect(
      service.assignIssueOwner(CONTEXT, PROJECT.id, "issue1", { ownerId: "user2aaaaaaaaaaaaaaaaaa" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("issue links", () => {
  it("adds a link and reads it back from the same transaction", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue());
    vi.mocked(issueRepository.createIssueLink).mockResolvedValue({ rowId: "link1aaaaaaaaaaaaaaaaaa" });
    vi.mocked(issueRepository.listIssueLinks).mockResolvedValue([
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

    const link = await service.linkIssue(CONTEXT, PROJECT.id, "issue1", {
      relation: "REQUIREMENT",
      targetId: "req1aaaaaaaaaaaaaaaaaaaa",
    });

    expect(link.relation).toBe("REQUIREMENT");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "issue.link_added" }),
      TX,
    );
  });

  it("**rejects a link to a target in another project**", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue());
    vi.mocked(issueRepository.issueLinkTargetExistsInProject).mockResolvedValue(false);

    await expect(
      service.linkIssue(CONTEXT, PROJECT.id, "issue1", {
        relation: "DESIGN_ITEM",
        targetId: "designfromotherproject",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(issueRepository.createIssueLink).not.toHaveBeenCalled();
    expect(auditLogRepository.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects a duplicate link", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue());
    vi.mocked(issueRepository.issueLinkExists).mockResolvedValue(true);

    await expect(
      service.linkIssue(CONTEXT, PROJECT.id, "issue1", {
        relation: "REQUIREMENT",
        targetId: "req1aaaaaaaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(issueRepository.createIssueLink).not.toHaveBeenCalled();
  });

  it("**refuses to link a closed issue**", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue({ status: "CLOSED" }));

    await expect(
      service.linkIssue(CONTEXT, PROJECT.id, "issue1", {
        relation: "REQUIREMENT",
        targetId: "req1aaaaaaaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("removes a link by its composite key and audits it", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue());
    vi.mocked(issueRepository.deleteIssueLink).mockResolvedValue(1);

    await service.unlinkIssue(CONTEXT, PROJECT.id, "issue1", "REQUIREMENT:link1aaaaaaaaaaaaaaaaaa");

    expect(issueRepository.deleteIssueLink).toHaveBeenCalledWith(
      "issue1aaaaaaaaaaaaaaaa",
      "REQUIREMENT",
      "link1aaaaaaaaaaaaaaaaaa",
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "issue.link_removed" }),
      TX,
    );
  });

  it("404s removing a link that does not exist", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue());
    vi.mocked(issueRepository.deleteIssueLink).mockResolvedValue(0);

    await expect(
      service.unlinkIssue(CONTEXT, PROJECT.id, "issue1", "REQUIREMENT:link1aaaaaaaaaaaaaaaaaa"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("400s an unparseable link id", async () => {
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue());

    await expect(
      service.unlinkIssue(CONTEXT, PROJECT.id, "issue1", "not-a-valid-key"),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("tenancy", () => {
  it("never reaches the repository for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(service.listIssues(CONTEXT, "elsewhere")).rejects.toBeInstanceOf(NotFoundError);
    expect(issueRepository.listIssuesInProject).not.toHaveBeenCalled();
  });
});

describe("project role authorization", () => {
  function asRole(role: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER") {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue({
      id: "mem1",
      projectId: PROJECT.id,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
    } as never);
  }

  it("refuses a VIEWER creating an issue", async () => {
    asRole("VIEWER");
    await expect(service.createIssue(CONTEXT, PROJECT.id, VALID_CREATE)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(issueRepository.createIssue).not.toHaveBeenCalled();
  });

  it("refuses a REVIEWER creating an issue — read/review authority is not write authority", async () => {
    asRole("REVIEWER");
    await expect(service.createIssue(CONTEXT, PROJECT.id, VALID_CREATE)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("allows an ENGINEER to create and transition an issue — issue disposition is ordinary engineering work", async () => {
    asRole("ENGINEER");
    vi.mocked(issueRepository.createIssue).mockResolvedValue(issue());
    await expect(
      service.createIssue(CONTEXT, PROJECT.id, VALID_CREATE),
    ).resolves.toMatchObject({ identifier: "ISS-001" });

    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue());
    vi.mocked(issueRepository.updateIssue).mockResolvedValue(issue({ status: "IN_PROGRESS" }));
    await expect(
      service.transitionIssue(CONTEXT, PROJECT.id, "issue1", { to: "IN_PROGRESS" }),
    ).resolves.toMatchObject({ status: "IN_PROGRESS" });
  });

  it("refuses a VIEWER assigning an issue owner", async () => {
    asRole("VIEWER");
    vi.mocked(issueRepository.findIssueInProject).mockResolvedValue(issue());

    await expect(
      service.assignIssueOwner(CONTEXT, PROJECT.id, "issue1", { ownerId: "user2aaaaaaaaaaaaaaaaaaa" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(issueRepository.updateIssue).not.toHaveBeenCalled();
  });

  it("allows a MANAGER to create an issue", async () => {
    asRole("MANAGER");
    vi.mocked(issueRepository.createIssue).mockResolvedValue(issue());
    await expect(
      service.createIssue(CONTEXT, PROJECT.id, VALID_CREATE),
    ).resolves.toMatchObject({ identifier: "ISS-001" });
  });
});
