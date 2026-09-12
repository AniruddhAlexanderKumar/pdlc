// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * Evidence route handlers, driven through a faked service so that path
 * parsing, authentication, body handling and error-to-status mapping are
 * exercised without re-testing lifecycle logic — that lives in
 * `evidence.service.test.ts` against faked repositories.
 */

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada", email: "ada@example.test", role: "ADMIN" },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedContext: vi.fn(async () => CONTEXT),
}));

vi.mock("@/server/services/evidence.service", () => ({
  createEvidence: vi.fn(),
  listEvidence: vi.fn(),
  getEvidence: vi.fn(),
  updateEvidence: vi.fn(),
  validateEvidence: vi.fn(),
  supersedeEvidence: vi.fn(),
  listEvidenceLinks: vi.fn(),
  linkEvidence: vi.fn(),
  unlinkEvidence: vi.fn(),
  listLinkTargets: vi.fn(),
}));

const authContext = await import("@/server/auth/context");
const service = await import("@/server/services/evidence.service");

const collectionRoute = await import("@/app/api/projects/[projectId]/evidence/route");
const itemRoute = await import("@/app/api/projects/[projectId]/evidence/[evidenceId]/route");
const validateRoute = await import(
  "@/app/api/projects/[projectId]/evidence/[evidenceId]/validate/route"
);
const supersedeRoute = await import(
  "@/app/api/projects/[projectId]/evidence/[evidenceId]/supersede/route"
);
const linksRoute = await import("@/app/api/projects/[projectId]/evidence/[evidenceId]/links/route");
const linkDetailRoute = await import(
  "@/app/api/projects/[projectId]/evidence/[evidenceId]/links/[linkId]/route"
);
const linkTargetsRoute = await import("@/app/api/projects/[projectId]/evidence-link-targets/route");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const EVIDENCE_ID = "ev1aaaaaaaaaaaaaaaaaaaaa";

const BASE = `http://localhost/api/projects/${PROJECT_ID}/evidence`;
const projectParams = { params: Promise.resolve({ projectId: PROJECT_ID }) };
const evidenceParams = { params: Promise.resolve({ projectId: PROJECT_ID, evidenceId: EVIDENCE_ID }) };

const EVIDENCE = {
  id: EVIDENCE_ID,
  projectId: PROJECT_ID,
  identifier: "EV-001",
  title: "Hot fire test report",
  description: null,
  evidenceType: "TEST_RESULT",
  sourceReference: "TR-2026-014",
  status: "DRAFT",
  recordedById: CONTEXT.actorId,
  recordedBy: { id: CONTEXT.actorId, name: "Ada", email: "ada@example.test" },
  validatedById: null,
  validatedBy: null,
  validatedAt: null,
  supersededById: null,
  supersededByRef: null,
  supersededAt: null,
  links: [],
  citingFindings: [],
  availableTransitions: ["VALIDATED", "SUPERSEDED"],
  editable: { content: true, links: true },
  history: [],
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
};

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
});

describe("authentication", () => {
  it("401s every evidence route without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const responses = await Promise.all([
      collectionRoute.GET(new Request(BASE), projectParams),
      collectionRoute.POST(jsonRequest(BASE, {}), projectParams),
      itemRoute.GET(new Request(`${BASE}/${EVIDENCE_ID}`), evidenceParams),
      itemRoute.PATCH(jsonRequest(`${BASE}/${EVIDENCE_ID}`, {}, "PATCH"), evidenceParams),
      validateRoute.POST(jsonRequest(`${BASE}/${EVIDENCE_ID}/validate`, {}), evidenceParams),
      supersedeRoute.POST(jsonRequest(`${BASE}/${EVIDENCE_ID}/supersede`, {}), evidenceParams),
      linksRoute.GET(new Request(`${BASE}/${EVIDENCE_ID}/links`), evidenceParams),
      linksRoute.POST(jsonRequest(`${BASE}/${EVIDENCE_ID}/links`, {}), evidenceParams),
    ]);

    expect(responses.map((response) => response.status)).toEqual(
      new Array(responses.length).fill(401),
    );
  });

  it("never reaches the service when the session is missing", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    await collectionRoute.POST(jsonRequest(BASE, {}), projectParams);

    expect(service.createEvidence).not.toHaveBeenCalled();
  });
});

describe("GET /evidence", () => {
  it("lists evidence, forwarding status and evidenceType filters from the query string", async () => {
    vi.mocked(service.listEvidence).mockResolvedValue([EVIDENCE] as never);

    const response = await collectionRoute.GET(
      new Request(`${BASE}?status=DRAFT&evidenceType=TEST_RESULT`),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evidence).toHaveLength(1);
    expect(service.listEvidence).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, {
      status: "DRAFT",
      evidenceType: "TEST_RESULT",
    });
  });
});

describe("POST /evidence", () => {
  it("creates evidence and returns 201", async () => {
    vi.mocked(service.createEvidence).mockResolvedValue(EVIDENCE as never);

    const response = await collectionRoute.POST(
      jsonRequest(BASE, {
        identifier: "EV-001",
        title: "Hot fire test report",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-2026-014",
      }),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.evidence.identifier).toBe("EV-001");
  });

  it("400s on invalid input", async () => {
    vi.mocked(service.createEvidence).mockRejectedValue(new ValidationError("A title is required"));

    const response = await collectionRoute.POST(jsonRequest(BASE, { identifier: "EV-001" }), projectParams);
    expect(response.status).toBe(400);
  });

  it("409s a duplicate identifier", async () => {
    vi.mocked(service.createEvidence).mockRejectedValue(
      new ConflictError("Evidence EV-001 already exists in this project."),
    );

    const response = await collectionRoute.POST(
      jsonRequest(BASE, {
        identifier: "EV-001",
        title: "x",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-1",
      }),
      projectParams,
    );
    expect(response.status).toBe(409);
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(service.createEvidence).mockRejectedValue(new NotFoundError("Project not found."));

    const response = await collectionRoute.POST(jsonRequest(BASE, {}), projectParams);
    expect(response.status).toBe(404);
  });
});

describe("GET /evidence/[evidenceId]", () => {
  it("returns full evidence detail", async () => {
    vi.mocked(service.getEvidence).mockResolvedValue(EVIDENCE as never);

    const response = await itemRoute.GET(new Request(`${BASE}/${EVIDENCE_ID}`), evidenceParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evidence.identifier).toBe("EV-001");
  });

  it("404s for evidence in another project", async () => {
    vi.mocked(service.getEvidence).mockRejectedValue(new NotFoundError("Evidence not found."));

    const response = await itemRoute.GET(new Request(`${BASE}/${EVIDENCE_ID}`), evidenceParams);
    expect(response.status).toBe(404);
  });
});

describe("PATCH /evidence/[evidenceId]", () => {
  it("updates content fields", async () => {
    vi.mocked(service.updateEvidence).mockResolvedValue({ ...EVIDENCE, title: "Revised" } as never);

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${EVIDENCE_ID}`, { title: "Revised" }, "PATCH"),
      evidenceParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evidence.title).toBe("Revised");
  });

  it("409s editing VALIDATED evidence", async () => {
    vi.mocked(service.updateEvidence).mockRejectedValue(
      new ConflictError("Evidence that is VALIDATED is read-only."),
    );

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${EVIDENCE_ID}`, { title: "x" }, "PATCH"),
      evidenceParams,
    );
    expect(response.status).toBe(409);
  });

  it("400s a status field on the generic update route — lifecycle moves through /validate and /supersede only", async () => {
    vi.mocked(service.updateEvidence).mockRejectedValue(new ValidationError("Unrecognized field"));

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${EVIDENCE_ID}`, { status: "VALIDATED" }, "PATCH"),
      evidenceParams,
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /evidence/[evidenceId]/validate", () => {
  it("validates and returns the updated evidence", async () => {
    vi.mocked(service.validateEvidence).mockResolvedValue({ ...EVIDENCE, status: "VALIDATED" } as never);

    const response = await validateRoute.POST(
      jsonRequest(`${BASE}/${EVIDENCE_ID}/validate`, {}),
      evidenceParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evidence.status).toBe("VALIDATED");
  });

  it("409s validating already-VALIDATED evidence", async () => {
    vi.mocked(service.validateEvidence).mockRejectedValue(
      new ConflictError("This evidence is already VALIDATED."),
    );

    const response = await validateRoute.POST(
      jsonRequest(`${BASE}/${EVIDENCE_ID}/validate`, {}),
      evidenceParams,
    );
    expect(response.status).toBe(409);
  });
});

describe("POST /evidence/[evidenceId]/supersede", () => {
  it("supersedes and returns the updated evidence", async () => {
    vi.mocked(service.supersedeEvidence).mockResolvedValue({
      ...EVIDENCE,
      status: "SUPERSEDED",
      supersededById: "ev2aaaaaaaaaaaaaaaaaaaaa",
    } as never);

    const response = await supersedeRoute.POST(
      jsonRequest(`${BASE}/${EVIDENCE_ID}/supersede`, { newEvidenceId: "ev2aaaaaaaaaaaaaaaaaaaaa" }),
      evidenceParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evidence.status).toBe("SUPERSEDED");
  });

  it("400s a missing newEvidenceId", async () => {
    vi.mocked(service.supersedeEvidence).mockRejectedValue(new ValidationError("Invalid supersession request"));

    const response = await supersedeRoute.POST(
      jsonRequest(`${BASE}/${EVIDENCE_ID}/supersede`, {}),
      evidenceParams,
    );
    expect(response.status).toBe(400);
  });
});

describe("links", () => {
  it("GET returns every trace edge", async () => {
    vi.mocked(service.listEvidenceLinks).mockResolvedValue([
      {
        id: "REQUIREMENT:row1",
        relation: "REQUIREMENT",
        targetId: "req1",
        identifier: "REQ-001",
        title: "Chamber pressure",
        note: null,
        createdAt: new Date(),
      },
    ] as never);

    const response = await linksRoute.GET(new Request(`${BASE}/${EVIDENCE_ID}/links`), evidenceParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.links).toHaveLength(1);
  });

  it("POST adds a link and returns 201", async () => {
    vi.mocked(service.linkEvidence).mockResolvedValue({
      id: "REQUIREMENT:row1",
      relation: "REQUIREMENT",
      targetId: "req1",
      identifier: "REQ-001",
      title: "Chamber pressure",
      note: null,
      createdAt: new Date(),
    } as never);

    const response = await linksRoute.POST(
      jsonRequest(`${BASE}/${EVIDENCE_ID}/links`, { relation: "REQUIREMENT", targetId: "req1" }),
      evidenceParams,
    );
    expect(response.status).toBe(201);
  });

  it("400s a link to a target outside the project", async () => {
    vi.mocked(service.linkEvidence).mockRejectedValue(
      new ValidationError("That target does not exist in this project."),
    );

    const response = await linksRoute.POST(
      jsonRequest(`${BASE}/${EVIDENCE_ID}/links`, { relation: "REQUIREMENT", targetId: "elsewhere" }),
      evidenceParams,
    );
    expect(response.status).toBe(400);
  });

  it("DELETE removes a link by its composite id", async () => {
    vi.mocked(service.unlinkEvidence).mockResolvedValue(undefined);

    const response = await linkDetailRoute.DELETE(
      new Request(`${BASE}/${EVIDENCE_ID}/links/REQUIREMENT:row1`),
      { params: Promise.resolve({ projectId: PROJECT_ID, evidenceId: EVIDENCE_ID, linkId: "REQUIREMENT:row1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.removed).toBe(true);
  });

  it("404s deleting a link that does not exist", async () => {
    vi.mocked(service.unlinkEvidence).mockRejectedValue(new NotFoundError("That traceability link does not exist."));

    const response = await linkDetailRoute.DELETE(
      new Request(`${BASE}/${EVIDENCE_ID}/links/REQUIREMENT:row1`),
      { params: Promise.resolve({ projectId: PROJECT_ID, evidenceId: EVIDENCE_ID, linkId: "REQUIREMENT:row1" }) },
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /evidence-link-targets", () => {
  it("returns the project-scoped selector options", async () => {
    vi.mocked(service.listLinkTargets).mockResolvedValue({
      REQUIREMENT: [],
      ENGINEERING_DECISION: [],
      VERIFICATION_ACTIVITY: [],
      SUPPLIED_ITEM: [],
      SUPPLIER_QUALIFICATION: [],
      COMPLIANCE_ITEM: [],
    } as never);

    const response = await linkTargetsRoute.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/evidence-link-targets`),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.targets).toHaveProperty("REQUIREMENT");
    expect(body.targets).toHaveProperty("COMPLIANCE_ITEM");
  });
});

describe("what the API never exposes", () => {
  it("offers no route that would let a client set status through the generic update", () => {
    expect((itemRoute as unknown as Record<string, unknown>).DELETE).toBeUndefined();
  });

  it("returns no probability, impact, score, matrix or file-hash field in any payload", async () => {
    vi.mocked(service.getEvidence).mockResolvedValue(EVIDENCE as never);

    const response = await itemRoute.GET(new Request(`${BASE}/${EVIDENCE_ID}`), evidenceParams);
    const text = await response.text();

    expect(text).not.toMatch(/probability|impact|riskScore|matrix|checksum|fileHash|sha256/i);
  });
});
