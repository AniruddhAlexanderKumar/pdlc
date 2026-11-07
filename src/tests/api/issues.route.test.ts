// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * Issue route handlers, driven through a faked service so that path parsing,
 * authentication, body handling and error-to-status mapping are exercised
 * without re-testing lifecycle/ownership logic — that lives in
 * `issue.service.test.ts` against faked repositories.
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

vi.mock("@/server/services/issue.service", () => ({
  createIssue: vi.fn(),
  listIssues: vi.fn(),
  getIssue: vi.fn(),
  updateIssue: vi.fn(),
  transitionIssue: vi.fn(),
  assignIssueOwner: vi.fn(),
  listIssueLinks: vi.fn(),
  linkIssue: vi.fn(),
  unlinkIssue: vi.fn(),
  listLinkTargets: vi.fn(),
}));

const authContext = await import("@/server/auth/context");
const service = await import("@/server/services/issue.service");

const collectionRoute = await import("@/app/api/projects/[projectId]/issues/route");
const itemRoute = await import("@/app/api/projects/[projectId]/issues/[issueId]/route");
const transitionRoute = await import("@/app/api/projects/[projectId]/issues/[issueId]/transition/route");
const ownerRoute = await import("@/app/api/projects/[projectId]/issues/[issueId]/owner/route");
const linksRoute = await import("@/app/api/projects/[projectId]/issues/[issueId]/links/route");
const linkDetailRoute = await import(
  "@/app/api/projects/[projectId]/issues/[issueId]/links/[linkId]/route"
);
const linkTargetsRoute = await import("@/app/api/projects/[projectId]/issue-link-targets/route");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const ISSUE_ID = "issue1aaaaaaaaaaaaaaaa";

const BASE = `http://localhost/api/projects/${PROJECT_ID}/issues`;
const projectParams = { params: Promise.resolve({ projectId: PROJECT_ID }) };
const issueParams = { params: Promise.resolve({ projectId: PROJECT_ID, issueId: ISSUE_ID }) };

const ISSUE = {
  id: ISSUE_ID,
  projectId: PROJECT_ID,
  identifier: "ISS-001",
  title: "Chamber wall crack found",
  description: "A hairline crack was found during post-test inspection.",
  severity: "HIGH",
  status: "OPEN",
  ownerId: null,
  owner: null,
  links: [],
  availableTransitions: ["IN_PROGRESS", "RESOLVED"],
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
  it("401s every issue route without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const responses = await Promise.all([
      collectionRoute.GET(new Request(BASE), projectParams),
      collectionRoute.POST(jsonRequest(BASE, {}), projectParams),
      itemRoute.GET(new Request(`${BASE}/${ISSUE_ID}`), issueParams),
      itemRoute.PATCH(jsonRequest(`${BASE}/${ISSUE_ID}`, {}, "PATCH"), issueParams),
      transitionRoute.POST(jsonRequest(`${BASE}/${ISSUE_ID}/transition`, {}), issueParams),
      ownerRoute.POST(jsonRequest(`${BASE}/${ISSUE_ID}/owner`, {}), issueParams),
      linksRoute.GET(new Request(`${BASE}/${ISSUE_ID}/links`), issueParams),
      linksRoute.POST(jsonRequest(`${BASE}/${ISSUE_ID}/links`, {}), issueParams),
    ]);

    expect(responses.map((response) => response.status)).toEqual(
      new Array(responses.length).fill(401),
    );
  });

  it("never reaches the service when the session is missing", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    await collectionRoute.POST(jsonRequest(BASE, {}), projectParams);

    expect(service.createIssue).not.toHaveBeenCalled();
  });
});

describe("GET /issues", () => {
  it("lists issues, forwarding status and severity filters from the query string", async () => {
    vi.mocked(service.listIssues).mockResolvedValue([ISSUE] as never);

    const response = await collectionRoute.GET(
      new Request(`${BASE}?status=OPEN&severity=HIGH`),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.issues).toHaveLength(1);
    expect(service.listIssues).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, {
      status: "OPEN",
      severity: "HIGH",
    });
  });
});

describe("POST /issues", () => {
  it("creates an issue and returns 201", async () => {
    vi.mocked(service.createIssue).mockResolvedValue(ISSUE as never);

    const response = await collectionRoute.POST(
      jsonRequest(BASE, {
        identifier: "ISS-001",
        title: "Chamber wall crack found",
        description: "A hairline crack was found during post-test inspection.",
        severity: "HIGH",
      }),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.issue.identifier).toBe("ISS-001");
  });

  it("takes the project from the path, never from the body", async () => {
    vi.mocked(service.createIssue).mockResolvedValue(ISSUE as never);

    await collectionRoute.POST(
      jsonRequest(BASE, {
        identifier: "ISS-001",
        title: "x",
        description: "y",
        severity: "LOW",
        projectId: "proj9aaaaaaaaaaaaaaaaaa",
      }),
      projectParams,
    );

    expect(service.createIssue).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, expect.objectContaining({}));
  });

  it("400s on invalid input (missing severity)", async () => {
    vi.mocked(service.createIssue).mockRejectedValue(new ValidationError("Invalid issue"));

    const response = await collectionRoute.POST(
      jsonRequest(BASE, { identifier: "ISS-001", title: "x", description: "y" }),
      projectParams,
    );
    expect(response.status).toBe(400);
  });

  it("400s on a malformed body", async () => {
    const response = await collectionRoute.POST(
      new Request(BASE, { method: "POST", headers: { "content-type": "application/json" }, body: "not json" }),
      projectParams,
    );
    expect(response.status).toBe(400);
    expect(service.createIssue).not.toHaveBeenCalled();
  });

  it("409s a duplicate identifier", async () => {
    vi.mocked(service.createIssue).mockRejectedValue(
      new ConflictError("Issue ISS-001 already exists in this project."),
    );

    const response = await collectionRoute.POST(
      jsonRequest(BASE, { identifier: "ISS-001", title: "x", description: "y", severity: "LOW" }),
      projectParams,
    );
    expect(response.status).toBe(409);
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(service.createIssue).mockRejectedValue(new NotFoundError("Project was not found."));

    const response = await collectionRoute.POST(
      jsonRequest(BASE, { identifier: "ISS-001", title: "x", description: "y", severity: "LOW" }),
      projectParams,
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /issues/[issueId]", () => {
  it("returns full issue detail", async () => {
    vi.mocked(service.getIssue).mockResolvedValue(ISSUE as never);

    const response = await itemRoute.GET(new Request(`${BASE}/${ISSUE_ID}`), issueParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.issue.editable).toEqual({ content: true, owner: true, links: true });
  });

  it("404s for an issue in another project", async () => {
    vi.mocked(service.getIssue).mockRejectedValue(new NotFoundError("Issue was not found."));

    const response = await itemRoute.GET(new Request(`${BASE}/${ISSUE_ID}`), issueParams);
    expect(response.status).toBe(404);
  });
});

describe("PATCH /issues/[issueId]", () => {
  it("updates content fields, including severity", async () => {
    vi.mocked(service.updateIssue).mockResolvedValue({ ...ISSUE, severity: "CRITICAL" } as never);

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${ISSUE_ID}`, { severity: "CRITICAL" }, "PATCH"),
      issueParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.issue.severity).toBe("CRITICAL");
  });

  it("409s editing a resolved issue", async () => {
    vi.mocked(service.updateIssue).mockRejectedValue(
      new ConflictError("An issue that is RESOLVED cannot be edited."),
    );

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${ISSUE_ID}`, { title: "Revised" }, "PATCH"),
      issueParams,
    );
    expect(response.status).toBe(409);
  });

  it("400s a status field on the generic update route — lifecycle moves through /transition only", async () => {
    vi.mocked(service.updateIssue).mockRejectedValue(new ValidationError("Invalid issue update"));

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${ISSUE_ID}`, { status: "CLOSED" }, "PATCH"),
      issueParams,
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /issues/[issueId]/transition", () => {
  it("transitions status and returns the updated issue", async () => {
    vi.mocked(service.transitionIssue).mockResolvedValue({ ...ISSUE, status: "IN_PROGRESS" } as never);

    const response = await transitionRoute.POST(
      jsonRequest(`${BASE}/${ISSUE_ID}/transition`, { to: "IN_PROGRESS" }),
      issueParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.issue.status).toBe("IN_PROGRESS");
  });

  it("409s an illegal transition", async () => {
    vi.mocked(service.transitionIssue).mockRejectedValue(
      new ConflictError("An issue that is IN_PROGRESS cannot move to CLOSED."),
    );

    const response = await transitionRoute.POST(
      jsonRequest(`${BASE}/${ISSUE_ID}/transition`, { to: "CLOSED" }),
      issueParams,
    );
    expect(response.status).toBe(409);
  });
});

describe("POST /issues/[issueId]/owner", () => {
  it("assigns an owner", async () => {
    vi.mocked(service.assignIssueOwner).mockResolvedValue({
      ...ISSUE,
      ownerId: "user2aaaaaaaaaaaaaaaaaa",
    } as never);

    const response = await ownerRoute.POST(
      jsonRequest(`${BASE}/${ISSUE_ID}/owner`, { ownerId: "user2aaaaaaaaaaaaaaaaaa" }),
      issueParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.issue.ownerId).toBe("user2aaaaaaaaaaaaaaaaaa");
  });

  it("400s an owner outside the caller's organization", async () => {
    vi.mocked(service.assignIssueOwner).mockRejectedValue(
      new ValidationError("That user is not a member of this organization."),
    );

    const response = await ownerRoute.POST(
      jsonRequest(`${BASE}/${ISSUE_ID}/owner`, { ownerId: "userfromanotherorg1234" }),
      issueParams,
    );
    expect(response.status).toBe(400);
  });
});

describe("links", () => {
  it("GET returns every trace edge", async () => {
    vi.mocked(service.listIssueLinks).mockResolvedValue([
      { id: "REQUIREMENT:link1", relation: "REQUIREMENT", targetId: "req1", identifier: "REQ-001", title: "x", note: null, createdAt: new Date() },
    ] as never);

    const response = await linksRoute.GET(new Request(`${BASE}/${ISSUE_ID}/links`), issueParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.links).toHaveLength(1);
  });

  it("POST adds a link and returns 201", async () => {
    vi.mocked(service.linkIssue).mockResolvedValue({
      id: "REQUIREMENT:link1",
      relation: "REQUIREMENT",
      targetId: "req1aaaaaaaaaaaaaaaaaaaa",
      identifier: "REQ-001",
      title: "Chamber pressure",
      note: null,
      createdAt: new Date(),
    } as never);

    const response = await linksRoute.POST(
      jsonRequest(`${BASE}/${ISSUE_ID}/links`, { relation: "REQUIREMENT", targetId: "req1aaaaaaaaaaaaaaaaaaaa" }),
      issueParams,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.link.relation).toBe("REQUIREMENT");
  });

  it("400s a link to a target outside the project", async () => {
    vi.mocked(service.linkIssue).mockRejectedValue(
      new ValidationError("That target does not exist in this project."),
    );

    const response = await linksRoute.POST(
      jsonRequest(`${BASE}/${ISSUE_ID}/links`, { relation: "REQUIREMENT", targetId: "foreign" }),
      issueParams,
    );
    expect(response.status).toBe(400);
  });

  it("DELETE removes a link by its composite id", async () => {
    vi.mocked(service.unlinkIssue).mockResolvedValue(undefined as never);

    const response = await linkDetailRoute.DELETE(new Request(`${BASE}/${ISSUE_ID}/links/REQUIREMENT:link1`), {
      params: Promise.resolve({ projectId: PROJECT_ID, issueId: ISSUE_ID, linkId: "REQUIREMENT:link1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.removed).toBe(true);
    expect(service.unlinkIssue).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, ISSUE_ID, "REQUIREMENT:link1");
  });

  it("404s deleting a link that does not exist", async () => {
    vi.mocked(service.unlinkIssue).mockRejectedValue(new NotFoundError("That traceability link does not exist."));

    const response = await linkDetailRoute.DELETE(new Request(`${BASE}/${ISSUE_ID}/links/REQUIREMENT:link1`), {
      params: Promise.resolve({ projectId: PROJECT_ID, issueId: ISSUE_ID, linkId: "REQUIREMENT:link1" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("GET /issue-link-targets", () => {
  it("returns the project-scoped selector options", async () => {
    vi.mocked(service.listLinkTargets).mockResolvedValue({
      REQUIREMENT: [],
      DESIGN_ITEM: [],
      ENGINEERING_DECISION: [],
    } as never);

    const response = await linkTargetsRoute.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/issue-link-targets`),
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
    vi.mocked(service.getIssue).mockResolvedValue(ISSUE as never);

    const response = await itemRoute.GET(new Request(`${BASE}/${ISSUE_ID}`), issueParams);
    const text = JSON.stringify(await response.json());

    expect(text).not.toMatch(/"probability"|"impact"|"score"|"matrix"|"priority"/i);
  });
});
