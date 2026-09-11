// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * Risk route handlers, driven through a faked service so that path parsing,
 * authentication, body handling and error-to-status mapping are exercised
 * without re-testing lifecycle/ownership logic — that lives in
 * `risk.service.test.ts` against faked repositories.
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

vi.mock("@/server/services/risk.service", () => ({
  createRisk: vi.fn(),
  listRisks: vi.fn(),
  getRisk: vi.fn(),
  updateRisk: vi.fn(),
  transitionRisk: vi.fn(),
  assignRiskOwner: vi.fn(),
  listRiskLinks: vi.fn(),
  linkRisk: vi.fn(),
  unlinkRisk: vi.fn(),
  listLinkTargets: vi.fn(),
}));

const authContext = await import("@/server/auth/context");
const service = await import("@/server/services/risk.service");

const collectionRoute = await import("@/app/api/projects/[projectId]/risks/route");
const itemRoute = await import("@/app/api/projects/[projectId]/risks/[riskId]/route");
const transitionRoute = await import("@/app/api/projects/[projectId]/risks/[riskId]/transition/route");
const ownerRoute = await import("@/app/api/projects/[projectId]/risks/[riskId]/owner/route");
const linksRoute = await import("@/app/api/projects/[projectId]/risks/[riskId]/links/route");
const linkDetailRoute = await import(
  "@/app/api/projects/[projectId]/risks/[riskId]/links/[linkId]/route"
);
const linkTargetsRoute = await import("@/app/api/projects/[projectId]/risk-link-targets/route");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const RISK_ID = "risk1aaaaaaaaaaaaaaaaaa";

const BASE = `http://localhost/api/projects/${PROJECT_ID}/risks`;
const projectParams = { params: Promise.resolve({ projectId: PROJECT_ID }) };
const riskParams = { params: Promise.resolve({ projectId: PROJECT_ID, riskId: RISK_ID }) };

const RISK = {
  id: RISK_ID,
  projectId: PROJECT_ID,
  identifier: "RSK-001",
  title: "Coolant supply interruption",
  description: "The coolant loop may lose flow under vibration.",
  cause: null,
  consequence: null,
  status: "OPEN",
  ownerId: null,
  owner: null,
  links: [],
  availableTransitions: ["MITIGATED", "ACCEPTED", "CLOSED"],
  editable: { content: true, owner: true, links: true },
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
  it("401s every risk route without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const responses = await Promise.all([
      collectionRoute.GET(new Request(BASE), projectParams),
      collectionRoute.POST(jsonRequest(BASE, {}), projectParams),
      itemRoute.GET(new Request(`${BASE}/${RISK_ID}`), riskParams),
      itemRoute.PATCH(jsonRequest(`${BASE}/${RISK_ID}`, {}, "PATCH"), riskParams),
      transitionRoute.POST(jsonRequest(`${BASE}/${RISK_ID}/transition`, {}), riskParams),
      ownerRoute.POST(jsonRequest(`${BASE}/${RISK_ID}/owner`, {}), riskParams),
      linksRoute.GET(new Request(`${BASE}/${RISK_ID}/links`), riskParams),
      linksRoute.POST(jsonRequest(`${BASE}/${RISK_ID}/links`, {}), riskParams),
    ]);

    expect(responses.map((response) => response.status)).toEqual(
      new Array(responses.length).fill(401),
    );
  });

  it("never reaches the service when the session is missing", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    await collectionRoute.POST(jsonRequest(BASE, {}), projectParams);

    expect(service.createRisk).not.toHaveBeenCalled();
  });
});

describe("GET /risks", () => {
  it("lists risks, forwarding a status filter from the query string", async () => {
    vi.mocked(service.listRisks).mockResolvedValue([RISK] as never);

    const response = await collectionRoute.GET(new Request(`${BASE}?status=OPEN`), projectParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.risks).toHaveLength(1);
    expect(service.listRisks).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, { status: "OPEN" });
  });
});

describe("POST /risks", () => {
  it("creates a risk and returns 201", async () => {
    vi.mocked(service.createRisk).mockResolvedValue(RISK as never);

    const response = await collectionRoute.POST(
      jsonRequest(BASE, {
        identifier: "RSK-001",
        title: "Coolant supply interruption",
        description: "The coolant loop may lose flow under vibration.",
      }),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.risk.identifier).toBe("RSK-001");
  });

  it("takes the project from the path, never from the body", async () => {
    vi.mocked(service.createRisk).mockResolvedValue(RISK as never);

    await collectionRoute.POST(
      jsonRequest(BASE, {
        identifier: "RSK-001",
        title: "x",
        description: "y",
        projectId: "proj9aaaaaaaaaaaaaaaaaa",
      }),
      projectParams,
    );

    expect(service.createRisk).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, expect.objectContaining({}));
  });

  it("400s on invalid input", async () => {
    vi.mocked(service.createRisk).mockRejectedValue(new ValidationError("Invalid risk"));

    const response = await collectionRoute.POST(jsonRequest(BASE, { identifier: "RSK-001" }), projectParams);
    expect(response.status).toBe(400);
  });

  it("400s on a malformed body", async () => {
    const response = await collectionRoute.POST(
      new Request(BASE, { method: "POST", headers: { "content-type": "application/json" }, body: "not json" }),
      projectParams,
    );
    expect(response.status).toBe(400);
    expect(service.createRisk).not.toHaveBeenCalled();
  });

  it("409s a duplicate identifier", async () => {
    vi.mocked(service.createRisk).mockRejectedValue(new ConflictError("Risk RSK-001 already exists in this project."));

    const response = await collectionRoute.POST(
      jsonRequest(BASE, { identifier: "RSK-001", title: "x", description: "y" }),
      projectParams,
    );
    expect(response.status).toBe(409);
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(service.createRisk).mockRejectedValue(new NotFoundError("Project was not found."));

    const response = await collectionRoute.POST(
      jsonRequest(BASE, { identifier: "RSK-001", title: "x", description: "y" }),
      projectParams,
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /risks/[riskId]", () => {
  it("returns full risk detail", async () => {
    vi.mocked(service.getRisk).mockResolvedValue(RISK as never);

    const response = await itemRoute.GET(new Request(`${BASE}/${RISK_ID}`), riskParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.risk.editable).toEqual({ content: true, owner: true, links: true });
  });

  it("404s for a risk in another project", async () => {
    vi.mocked(service.getRisk).mockRejectedValue(new NotFoundError("Risk was not found."));

    const response = await itemRoute.GET(new Request(`${BASE}/${RISK_ID}`), riskParams);
    expect(response.status).toBe(404);
  });
});

describe("PATCH /risks/[riskId]", () => {
  it("updates content fields", async () => {
    vi.mocked(service.updateRisk).mockResolvedValue({ ...RISK, title: "Revised" } as never);

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${RISK_ID}`, { title: "Revised" }, "PATCH"),
      riskParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.risk.title).toBe("Revised");
  });

  it("409s editing a closed risk", async () => {
    vi.mocked(service.updateRisk).mockRejectedValue(new ConflictError("A risk that is CLOSED cannot be edited."));

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${RISK_ID}`, { title: "Revised" }, "PATCH"),
      riskParams,
    );
    expect(response.status).toBe(409);
  });

  it("400s a status field on the generic update route — lifecycle moves through /transition only", async () => {
    vi.mocked(service.updateRisk).mockRejectedValue(new ValidationError("Invalid risk update"));

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${RISK_ID}`, { status: "CLOSED" }, "PATCH"),
      riskParams,
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /risks/[riskId]/transition", () => {
  it("transitions status and returns the updated risk", async () => {
    vi.mocked(service.transitionRisk).mockResolvedValue({ ...RISK, status: "MITIGATED" } as never);

    const response = await transitionRoute.POST(
      jsonRequest(`${BASE}/${RISK_ID}/transition`, { to: "MITIGATED" }),
      riskParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.risk.status).toBe("MITIGATED");
  });

  it("409s an illegal transition", async () => {
    vi.mocked(service.transitionRisk).mockRejectedValue(
      new ConflictError("A risk that is CLOSED is final and cannot change status."),
    );

    const response = await transitionRoute.POST(
      jsonRequest(`${BASE}/${RISK_ID}/transition`, { to: "OPEN" }),
      riskParams,
    );
    expect(response.status).toBe(409);
  });
});

describe("POST /risks/[riskId]/owner", () => {
  it("assigns an owner", async () => {
    vi.mocked(service.assignRiskOwner).mockResolvedValue({ ...RISK, ownerId: "user2aaaaaaaaaaaaaaaaaa" } as never);

    const response = await ownerRoute.POST(
      jsonRequest(`${BASE}/${RISK_ID}/owner`, { ownerId: "user2aaaaaaaaaaaaaaaaaa" }),
      riskParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.risk.ownerId).toBe("user2aaaaaaaaaaaaaaaaaa");
  });

  it("400s an owner outside the caller's organization", async () => {
    vi.mocked(service.assignRiskOwner).mockRejectedValue(
      new ValidationError("That user is not a member of this organization."),
    );

    const response = await ownerRoute.POST(
      jsonRequest(`${BASE}/${RISK_ID}/owner`, { ownerId: "userfromanotherorg1234" }),
      riskParams,
    );
    expect(response.status).toBe(400);
  });
});

describe("links", () => {
  it("GET returns every trace edge", async () => {
    vi.mocked(service.listRiskLinks).mockResolvedValue([
      { id: "REQUIREMENT:link1", relation: "REQUIREMENT", targetId: "req1", identifier: "REQ-001", title: "x", note: null, createdAt: new Date() },
    ] as never);

    const response = await linksRoute.GET(new Request(`${BASE}/${RISK_ID}/links`), riskParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.links).toHaveLength(1);
  });

  it("POST adds a link and returns 201", async () => {
    vi.mocked(service.linkRisk).mockResolvedValue({
      id: "REQUIREMENT:link1",
      relation: "REQUIREMENT",
      targetId: "req1aaaaaaaaaaaaaaaaaaaa",
      identifier: "REQ-001",
      title: "Chamber pressure",
      note: null,
      createdAt: new Date(),
    } as never);

    const response = await linksRoute.POST(
      jsonRequest(`${BASE}/${RISK_ID}/links`, { relation: "REQUIREMENT", targetId: "req1aaaaaaaaaaaaaaaaaaaa" }),
      riskParams,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.link.relation).toBe("REQUIREMENT");
  });

  it("400s a link to a target outside the project", async () => {
    vi.mocked(service.linkRisk).mockRejectedValue(
      new ValidationError("That target does not exist in this project."),
    );

    const response = await linksRoute.POST(
      jsonRequest(`${BASE}/${RISK_ID}/links`, { relation: "REQUIREMENT", targetId: "foreign" }),
      riskParams,
    );
    expect(response.status).toBe(400);
  });

  it("DELETE removes a link by its composite id", async () => {
    vi.mocked(service.unlinkRisk).mockResolvedValue(undefined as never);

    const response = await linkDetailRoute.DELETE(new Request(`${BASE}/${RISK_ID}/links/REQUIREMENT:link1`), {
      params: Promise.resolve({ projectId: PROJECT_ID, riskId: RISK_ID, linkId: "REQUIREMENT:link1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.removed).toBe(true);
    expect(service.unlinkRisk).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, RISK_ID, "REQUIREMENT:link1");
  });

  it("404s deleting a link that does not exist", async () => {
    vi.mocked(service.unlinkRisk).mockRejectedValue(new NotFoundError("That traceability link does not exist."));

    const response = await linkDetailRoute.DELETE(new Request(`${BASE}/${RISK_ID}/links/REQUIREMENT:link1`), {
      params: Promise.resolve({ projectId: PROJECT_ID, riskId: RISK_ID, linkId: "REQUIREMENT:link1" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("GET /risk-link-targets", () => {
  it("returns the project-scoped selector options", async () => {
    vi.mocked(service.listLinkTargets).mockResolvedValue({
      REQUIREMENT: [],
      DESIGN_ITEM: [],
      ENGINEERING_DECISION: [],
    } as never);

    const response = await linkTargetsRoute.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/risk-link-targets`),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.targets).toHaveProperty("REQUIREMENT");
  });
});

describe("what the API never exposes", () => {
  it("offers no route that would let a client set status through the generic update", () => {
    for (const route of [collectionRoute, itemRoute]) {
      expect(Object.keys(route)).not.toContain("DELETE");
    }
  });

  it("returns no probability, impact or numeric score in any payload", async () => {
    vi.mocked(service.getRisk).mockResolvedValue(RISK as never);

    const response = await itemRoute.GET(new Request(`${BASE}/${RISK_ID}`), riskParams);
    const text = JSON.stringify(await response.json());

    expect(text).not.toMatch(/"probability"|"impact"|"score"|"matrix"/i);
  });
});
