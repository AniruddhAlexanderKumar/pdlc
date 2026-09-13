// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CertificationBasis,
  CertificationFinding,
  CertificationProgram,
  ComplianceItem,
  Project,
  ProjectRole,
} from "@/domain";
import { UnauthorizedError } from "@/server/errors";

/**
 * Certification route handlers, driven through the *real* services with only
 * repositories and the transaction faked. Validation, lifecycle rules,
 * tenancy and status mapping are genuinely exercised without PostgreSQL.
 */
const TX = { __transaction: true } as const;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada", email: "ada@example.test", role: "ADMIN" },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedContext: vi.fn(async () => CONTEXT),
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

vi.mock("@/server/repositories/certification-review.repository", () => ({
  createReview: vi.fn(),
  createReviewFindings: vi.fn(),
  findLatestReview: vi.fn(),
  listReviews: vi.fn(),
  findReviewInProgram: vi.fn(),
  readReviewBasis: vi.fn(),
  listFindings: vi.fn(),
}));

vi.mock("@/server/repositories/certification-review-basis.repository", () => ({
  loadAssumptionContext: vi.fn(),
}));

vi.mock("@/server/repositories/engineering-baseline.repository", () => ({
  findActiveBaseline: vi.fn(),
}));

vi.mock("@/server/repositories/drift-assessment.repository", () => ({
  findLatestAssessment: vi.fn(),
  listFindings: vi.fn(),
}));

vi.mock("@/server/repositories/verification-readiness-basis.repository", () => ({
  loadChangeImpactContext: vi.fn(async () => []),
}));

vi.mock("@/server/repositories/project-revision.repository", () => ({
  computeProjectFingerprint: vi.fn(async () => "fp"),
}));

vi.mock("@/server/services/verification-readiness.service", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/verification-readiness.service")>(
    "@/server/services/verification-readiness.service",
  );
  return {
    ...actual,
    verificationReadinessService: {
      getLatestVerificationReadiness: vi.fn(async () => ({
        status: "NOT_EVALUATED",
        verificationActivityId: "",
        readinessVersion: "1",
      })),
    },
  };
});

vi.mock("@/server/services/engineering-graph.service", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/engineering-graph.service")>(
    "@/server/services/engineering-graph.service",
  );
  return {
    ...actual,
    engineeringGraphService: { getNodeRevisions: vi.fn(async () => new Map()) },
  };
});

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

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

const authContext = await import("@/server/auth/context");
const projectRepository = await import("@/server/repositories/project.repository");
const programRepository = await import("@/server/repositories/certification-program.repository");
const basisRepository = await import("@/server/repositories/certification-basis.repository");
const itemRepository = await import("@/server/repositories/compliance-item.repository");
const linkRepository = await import("@/server/repositories/compliance-link.repository");
const findingRepository = await import("@/server/repositories/certification-finding.repository");
const reviewRepository = await import("@/server/repositories/certification-review.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");

const programRoute = await import("@/app/api/projects/[projectId]/certification/program/route");
const basesRoute = await import("@/app/api/projects/[projectId]/certification/bases/route");
const basisDetailRoute = await import(
  "@/app/api/projects/[projectId]/certification/bases/[basisId]/route"
);
const basisActivateRoute = await import(
  "@/app/api/projects/[projectId]/certification/bases/[basisId]/activate/route"
);
const itemsRoute = await import("@/app/api/projects/[projectId]/certification/items/route");
const itemDetailRoute = await import(
  "@/app/api/projects/[projectId]/certification/items/[itemId]/route"
);
const linksRoute = await import(
  "@/app/api/projects/[projectId]/certification/items/[itemId]/links/route"
);
const linkDetailRoute = await import(
  "@/app/api/projects/[projectId]/certification/items/[itemId]/links/[linkId]/route"
);
const findingsRoute = await import(
  "@/app/api/projects/[projectId]/certification/items/[itemId]/findings/route"
);
const findingResolveRoute = await import(
  "@/app/api/projects/[projectId]/certification/items/[itemId]/findings/[findingId]/resolve/route"
);
const reviewsRoute = await import("@/app/api/projects/[projectId]/certification/reviews/route");
const reviewLatestRoute = await import(
  "@/app/api/projects/[projectId]/certification/reviews/latest/route"
);

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const PROGRAM_ID = "prog1aaaaaaaaaaaaaaaaaa";
const BASIS_ID = "basis1aaaaaaaaaaaaaaaaa";
const ITEM_ID = "item1aaaaaaaaaaaaaaaaaa";
const FINDING_ID = "find1aaaaaaaaaaaaaaaaaa";

const PROJECT: Project = {
  id: PROJECT_ID,
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Avionics",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const PROGRAM: CertificationProgram = {
  id: PROGRAM_ID,
  projectId: PROJECT_ID,
  identifier: "CERT-001",
  name: "Avionics certification effort",
  description: null,
  status: "DRAFT",
  ownerId: null,
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const BASIS: CertificationBasis = {
  id: BASIS_ID,
  certificationProgramId: PROGRAM_ID,
  identifier: "CB-001",
  title: "Part 25 Amdt 25-141",
  description: null,
  revision: "Amdt 25-141",
  sourceReference: null,
  status: "DRAFT",
  supersededById: null,
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
};

const ITEM: ComplianceItem = {
  id: ITEM_ID,
  certificationBasisId: BASIS_ID,
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
  id: FINDING_ID,
  complianceItemId: ITEM_ID,
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

const BASE = `http://localhost/api/projects/${PROJECT_ID}`;

function request(method: string, body?: unknown, url = BASE): Request {
  return new Request(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

const projectParams = { params: Promise.resolve({ projectId: PROJECT_ID }) };
const basisParams = { params: Promise.resolve({ projectId: PROJECT_ID, basisId: BASIS_ID }) };
const itemParams = { params: Promise.resolve({ projectId: PROJECT_ID, itemId: ITEM_ID }) };
const linkParams = {
  params: Promise.resolve({ projectId: PROJECT_ID, itemId: ITEM_ID, linkId: "REQUIREMENT:link1" }),
};
const findingParams = {
  params: Promise.resolve({ projectId: PROJECT_ID, itemId: ITEM_ID, findingId: FINDING_ID }),
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);

  const assumptionBasisRepository = await import(
    "@/server/repositories/certification-review-basis.repository"
  );
  vi.mocked(assumptionBasisRepository.loadAssumptionContext).mockResolvedValue([]);

  // CONTEXT's actor is treated as the organization owner — full implicit
  // project access with no explicit ProjectMembership row needed.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
});

describe("authentication", () => {
  it("401s every certification route without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(
      new UnauthorizedError("Sign in required."),
    );

    const responses = await Promise.all([
      programRoute.GET(request("GET"), projectParams),
      programRoute.POST(request("POST", { identifier: "CERT-001", name: "X" }), projectParams),
      programRoute.PATCH(request("PATCH", { name: "X" }), projectParams),
      basesRoute.GET(request("GET"), projectParams),
      basesRoute.POST(request("POST", { identifier: "CB-001", title: "X", revision: "1" }), projectParams),
      basisDetailRoute.GET(request("GET"), basisParams),
      basisDetailRoute.PATCH(request("PATCH", { title: "X" }), basisParams),
      basisActivateRoute.POST(request("POST", {}), basisParams),
      itemsRoute.GET(request("GET"), projectParams),
      itemsRoute.POST(request("POST", { identifier: "CI-001", title: "X" }), projectParams),
      itemDetailRoute.GET(request("GET"), itemParams),
      itemDetailRoute.PATCH(request("PATCH", { status: "OPEN" }), itemParams),
      linksRoute.GET(request("GET"), itemParams),
      linksRoute.POST(request("POST", { linkType: "REQUIREMENT", targetId: "r1" }), itemParams),
      linkDetailRoute.DELETE(request("DELETE"), linkParams),
      findingsRoute.GET(request("GET"), itemParams),
      findingsRoute.POST(
        request("POST", { identifier: "CF-001", title: "X", severity: "LOW" }),
        itemParams,
      ),
      findingResolveRoute.POST(request("POST", { note: "x" }), findingParams),
      reviewsRoute.GET(request("GET"), projectParams),
      reviewsRoute.POST(request("POST", {}), projectParams),
      reviewLatestRoute.GET(request("GET"), projectParams),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
    }
  });

  it("never reaches a repository when the session is missing", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(
      new UnauthorizedError("Sign in required."),
    );

    await programRoute.POST(request("POST", { identifier: "CERT-001", name: "X" }), projectParams);

    expect(projectRepository.findProjectInOrganization).not.toHaveBeenCalled();
    expect(programRepository.createProgram).not.toHaveBeenCalled();
  });
});

describe("programme routes", () => {
  it("creates the programme and returns 201", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(null);
    vi.mocked(programRepository.createProgram).mockResolvedValue(PROGRAM);

    const response = await programRoute.POST(
      request("POST", { identifier: "CERT-001", name: "Avionics certification effort" }),
      projectParams,
    );

    expect(response.status).toBe(201);
    expect((await response.json()).program.status).toBe("DRAFT");
  });

  it("returns null, not 404, when no programme exists yet", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(null);

    const response = await programRoute.GET(request("GET"), projectParams);

    expect(response.status).toBe(200);
    expect((await response.json()).program).toBeNull();
  });

  it("400s when a client tries to set an id or projectId directly", async () => {
    const response = await programRoute.POST(
      request("POST", { identifier: "CERT-001", name: "X", projectId: "someone-elses-project" }),
      projectParams,
    );

    expect(response.status).toBe(400);
    expect(programRepository.createProgram).not.toHaveBeenCalled();
  });

  it("409s creating a second programme for the same project", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);

    const response = await programRoute.POST(
      request("POST", { identifier: "CERT-002", name: "X" }),
      projectParams,
    );

    expect(response.status).toBe(409);
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    const response = await programRoute.GET(request("GET"), projectParams);

    expect(response.status).toBe(404);
  });
});

describe("basis routes", () => {
  it("creates a basis and returns 201", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.createBasis).mockResolvedValue(BASIS);

    const response = await basesRoute.POST(
      request("POST", { identifier: "CB-001", title: "Part 25 Amdt 25-141", revision: "Amdt 25-141" }),
      projectParams,
    );

    expect(response.status).toBe(201);
    expect((await response.json()).basis.status).toBe("DRAFT");
  });

  it("400s when a client tries to set status directly", async () => {
    const response = await basesRoute.POST(
      request("POST", { identifier: "CB-001", title: "X", revision: "1", status: "ACTIVE" }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("409s editing an ACTIVE basis", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findBasisInProgram).mockResolvedValue({ ...BASIS, status: "ACTIVE" });

    const response = await basisDetailRoute.PATCH(request("PATCH", { title: "X" }), basisParams);

    expect(response.status).toBe(409);
  });

  it("409s activating while another basis is already active, without supersedeActive", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findBasisInProgram).mockResolvedValue(BASIS);
    vi.mocked(basisRepository.findActiveBasis).mockResolvedValue({ ...BASIS, id: "other", status: "ACTIVE" });

    const response = await basisActivateRoute.POST(request("POST", {}), basisParams);

    expect(response.status).toBe(409);
  });
});

describe("compliance item routes", () => {
  it("creates an item under the active basis and returns 201", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findActiveBasis).mockResolvedValue(BASIS);
    vi.mocked(itemRepository.createItem).mockResolvedValue(ITEM);

    const response = await itemsRoute.POST(
      request("POST", { identifier: "CI-001", title: "Cabin pressurization limits" }),
      projectParams,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.item.applicability).toBe("UNDETERMINED");
    expect(body.item.disposition).toBe("UNASSESSED");
  });

  it("400s when a client tries to set applicability at creation time", async () => {
    const response = await itemsRoute.POST(
      request("POST", { identifier: "CI-001", title: "X", applicability: "APPLICABLE" }),
      projectParams,
    );

    expect(response.status).toBe(400);
    expect(itemRepository.createItem).not.toHaveBeenCalled();
  });

  it("PATCHes applicability with a rationale and returns it verbatim", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(itemRepository.updateItem).mockResolvedValue({
      ...ITEM,
      applicability: "APPLICABLE",
      applicabilityRationale: "Applies to this configuration.",
    });

    const response = await itemDetailRoute.PATCH(
      request("PATCH", { applicability: "APPLICABLE", applicabilityRationale: "Applies to this configuration." }),
      itemParams,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.item.applicability).toBe("APPLICABLE");
    expect(body.item.applicabilityRationale).toBe("Applies to this configuration.");
  });

  it("400s a disposition value outside the closed enum", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);

    const response = await itemDetailRoute.PATCH(
      request("PATCH", { disposition: "PROBABLY_FINE" }),
      itemParams,
    );

    expect(response.status).toBe(400);
    expect(itemRepository.updateItem).not.toHaveBeenCalled();
  });

  it("404s an item belonging to another project", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(null);

    const response = await itemDetailRoute.GET(request("GET"), itemParams);

    expect(response.status).toBe(404);
  });
});

describe("compliance link routes", () => {
  it("adds a link and returns 201 with the composite id", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(linkRepository.complianceLinkTargetExistsInProject).mockResolvedValue(true);
    vi.mocked(linkRepository.complianceLinkExists).mockResolvedValue(false);
    vi.mocked(linkRepository.createLink).mockResolvedValue({ rowId: "link1" });
    vi.mocked(linkRepository.listLinks).mockResolvedValue([
      {
        id: "REQUIREMENT:link1",
        complianceItemId: ITEM_ID,
        linkType: "REQUIREMENT",
        targetId: "req1aaaaaaaaaaaaaaaaaaa",
        targetIdentifier: "REQ-001",
        targetLabel: "Cabin pressurization",
        note: null,
        createdAt: new Date(),
        createdById: CONTEXT.actorId,
      },
    ]);

    const response = await linksRoute.POST(
      request("POST", { linkType: "REQUIREMENT", targetId: "req1aaaaaaaaaaaaaaaaaaa" }),
      itemParams,
    );

    expect(response.status).toBe(201);
    expect((await response.json()).link.id).toBe("REQUIREMENT:link1");
  });

  it("400s a link type outside the closed enum", async () => {
    const response = await linksRoute.POST(
      request("POST", { linkType: "PURCHASE_ORDER", targetId: "x" }),
      itemParams,
    );

    expect(response.status).toBe(400);
    expect(linkRepository.createLink).not.toHaveBeenCalled();
  });

  it("400s a target that does not exist in this project", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(linkRepository.complianceLinkTargetExistsInProject).mockResolvedValue(false);

    const response = await linksRoute.POST(
      request("POST", { linkType: "REQUIREMENT", targetId: "another-projects-requirement" }),
      itemParams,
    );

    expect(response.status).toBe(400);
  });

  it("removes a link and returns removed: true", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(linkRepository.deleteLink).mockResolvedValue(true);

    const response = await linkDetailRoute.DELETE(request("DELETE"), linkParams);

    expect(response.status).toBe(200);
    expect((await response.json()).removed).toBe(true);
  });
});

describe("certification finding routes", () => {
  it("creates a finding with explicit severity and returns 201", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(findingRepository.createFinding).mockResolvedValue(FINDING);

    const response = await findingsRoute.POST(
      request("POST", { identifier: "CF-001", title: "Missing analysis report", severity: "HIGH" }),
      itemParams,
    );

    expect(response.status).toBe(201);
    expect((await response.json()).finding.severity).toBe("HIGH");
  });

  it("400s a finding creation with no severity", async () => {
    const response = await findingsRoute.POST(
      request("POST", { identifier: "CF-001", title: "X" }),
      itemParams,
    );

    expect(response.status).toBe(400);
  });

  it("resolves a finding, requiring a note", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(findingRepository.findFindingInItem).mockResolvedValue(FINDING);
    vi.mocked(findingRepository.dispositionFinding).mockResolvedValue({
      ...FINDING,
      status: "RESOLVED",
      resolutionNote: "Fixed.",
      resolvedById: CONTEXT.actorId,
      resolvedAt: new Date(),
    });

    const response = await findingResolveRoute.POST(request("POST", { note: "Fixed." }), findingParams);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.finding.status).toBe("RESOLVED");
    expect(body.finding.resolvedById).toBe(CONTEXT.actorId);
  });

  it("400s a resolve call with an empty note", async () => {
    vi.mocked(itemRepository.findItemInProject).mockResolvedValue(ITEM);
    vi.mocked(findingRepository.findFindingInItem).mockResolvedValue(FINDING);

    const response = await findingResolveRoute.POST(request("POST", { note: "" }), findingParams);

    expect(response.status).toBe(400);
    expect(findingRepository.dispositionFinding).not.toHaveBeenCalled();
  });
});

describe("certification review routes", () => {
  it("says NOT_EVALUATED rather than returning an empty report when nothing has run", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(reviewRepository.findLatestReview).mockResolvedValue(null);

    const response = await reviewLatestRoute.GET(request("GET"), projectParams);

    expect(response.status).toBe(200);
    expect((await response.json()).report.status).toBe("NOT_EVALUATED");
  });

  it("400s when a client tries to supply a status or findings on evaluate", async () => {
    const response = await reviewsRoute.POST(
      request("POST", { status: "READY" }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("evaluates with an empty basis and produces UNKNOWN — never claims readiness from silence", async () => {
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findActiveBasis).mockResolvedValue(null);
    vi.mocked(linkRepository.loadReviewLinkage).mockResolvedValue({
      requirements: [],
      verificationActivities: [],
      decisions: [],
      designItems: [],
      risks: [],
      issues: [],
      supplierQualifications: [],
      evidence: [],
    });
    vi.mocked(findingRepository.listOpenFindingsForItems).mockResolvedValue([]);
    vi.mocked(findingRepository.listDispositionedFindingsForItems).mockResolvedValue([]);
    vi.mocked(reviewRepository.createReview).mockImplementation(async (input) => ({
      id: "review1",
      certificationProgramId: input.certificationProgramId,
      status: input.status,
      reviewVersion: input.reviewVersion,
      fingerprint: input.fingerprint,
      summary: input.summary,
      evaluatedAt: new Date(),
      evaluatedById: CONTEXT.actorId,
      createdAt: new Date(),
      counts: {
        findingCount: input.findingCount,
        blockingCount: input.blockingCount,
        warningCount: input.warningCount,
        informationalCount: input.informationalCount,
        unknownCount: input.unknownCount,
      },
    }));
    vi.mocked(reviewRepository.listFindings).mockResolvedValue([]);

    const response = await reviewsRoute.POST(request("POST", {}), projectParams);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.report.review.status).toBe("UNKNOWN");
    expect(body.report.findings).toEqual([]);
  });
});

describe("project role authorization", () => {
  function asRole(role: ProjectRole) {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue({
      id: "mem1",
      projectId: PROJECT.id,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: CONTEXT.actorId, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
    } as never);
  }

  it("refuses a VIEWER creating a certification program", async () => {
    asRole("VIEWER");

    const response = await programRoute.POST(
      request("POST", { identifier: "CERT-001", name: "X" }),
      projectParams,
    );

    expect(response.status).toBe(403);
    expect(programRepository.createProgram).not.toHaveBeenCalled();
  });

  it("refuses a REVIEWER updating a certification program — review authority is not write authority", async () => {
    asRole("REVIEWER");
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);

    const response = await programRoute.PATCH(request("PATCH", { name: "Renamed" }), projectParams);

    expect(response.status).toBe(403);
    expect(programRepository.updateProgram).not.toHaveBeenCalled();
  });

  it("allows an ENGINEER to create a certification program", async () => {
    asRole("ENGINEER");
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(null);
    vi.mocked(programRepository.createProgram).mockResolvedValue(PROGRAM);

    const response = await programRoute.POST(
      request("POST", { identifier: "CERT-001", name: "X" }),
      projectParams,
    );

    expect(response.status).toBe(201);
  });

  it("refuses a VIEWER evaluating a certification review", async () => {
    asRole("VIEWER");

    const response = await reviewsRoute.POST(request("POST", {}), projectParams);

    expect(response.status).toBe(403);
    expect(reviewRepository.createReview).not.toHaveBeenCalled();
  });

  it("allows an ENGINEER to evaluate a certification review — a system-derived, persisted evaluation, not an approval", async () => {
    asRole("ENGINEER");
    vi.mocked(programRepository.findProgramInProject).mockResolvedValue(PROGRAM);
    vi.mocked(basisRepository.findActiveBasis).mockResolvedValue(null);
    vi.mocked(linkRepository.loadReviewLinkage).mockResolvedValue({
      requirements: [],
      verificationActivities: [],
      decisions: [],
      designItems: [],
      risks: [],
      issues: [],
      supplierQualifications: [],
      evidence: [],
    });
    vi.mocked(findingRepository.listOpenFindingsForItems).mockResolvedValue([]);
    vi.mocked(findingRepository.listDispositionedFindingsForItems).mockResolvedValue([]);
    vi.mocked(reviewRepository.createReview).mockImplementation(async (input) => ({
      id: "review1",
      certificationProgramId: input.certificationProgramId,
      status: input.status,
      reviewVersion: input.reviewVersion,
      fingerprint: input.fingerprint,
      summary: input.summary,
      evaluatedAt: new Date(),
      evaluatedById: CONTEXT.actorId,
      createdAt: new Date(),
      counts: {
        findingCount: input.findingCount,
        blockingCount: input.blockingCount,
        warningCount: input.warningCount,
        informationalCount: input.informationalCount,
        unknownCount: input.unknownCount,
      },
    }));
    vi.mocked(reviewRepository.listFindings).mockResolvedValue([]);

    const response = await reviewsRoute.POST(request("POST", {}), projectParams);

    expect(response.status).toBe(201);
  });

  it("404s a same-organization caller with no project membership", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    const response = await programRoute.GET(request("GET"), projectParams);

    expect(response.status).toBe(404);
  });
});
