// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRAPH_EDGE_TYPES, type GraphNode } from "@/domain";
import { UnauthorizedError } from "@/server/errors";
import {
  buildTraceabilityFixture,
  FIXTURE_PROJECT,
  GraphFixture,
  nodeRef,
} from "@/tests/fixtures/graph-fixture";

/**
 * Graph route handlers driven through the *real* EngineeringGraphService, with
 * only the repository replaced by an in-memory graph. Path and query parsing,
 * the tenancy guard and the error-to-status mapping are genuinely exercised.
 */

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada", email: "ada@example.test", role: "ADMIN" },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

// Built once: the service singleton captures the repository when its module is
// first imported, so the routes read from this exact instance for the whole
// file. The graph shape is immutable; only the audit rows vary per test.
const built = buildTraceabilityFixture();
const fixture: GraphFixture = built.fixture;
const requirement: GraphNode = built.requirement;

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedContext: vi.fn(async () => CONTEXT),
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

// The route imports the service singleton, which reads through this repository.
vi.mock("@/server/repositories/graph-repository", () => ({
  get engineeringGraphRepository() {
    return fixture;
  },
}));

const authContext = await import("@/server/auth/context");
const projectRepository = await import("@/server/repositories/project.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");

const nodeRoute = await import(
  "@/app/api/projects/[projectId]/graph/node/[nodeType]/[nodeId]/route"
);
const neighborsRoute = await import(
  "@/app/api/projects/[projectId]/graph/node/[nodeType]/[nodeId]/neighbors/route"
);
const traverseRoute = await import("@/app/api/projects/[projectId]/graph/traverse/route");
const consistencyRoute = await import("@/app/api/projects/[projectId]/graph/consistency/route");

const PROJECT = FIXTURE_PROJECT;
const BASE = `http://localhost/api/projects/${PROJECT}/graph`;

function nodeParams(node: GraphNode) {
  return { params: Promise.resolve({ projectId: PROJECT, nodeType: node.type, nodeId: node.id }) };
}

const projectParams = { params: Promise.resolve({ projectId: PROJECT }) };

function traverseRequest(body: unknown) {
  return new Request(`${BASE}/traverse`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fixture.audit.clear();

  vi.mocked(authContext.requireAuthenticatedContext).mockReset();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
  vi.mocked(projectRepository.findProjectInOrganization).mockReset();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue({
    id: PROJECT,
  } as never);
  // CONTEXT's actor is treated as the organization owner — full implicit
  // project access with no explicit ProjectMembership row needed.
  vi.mocked(membershipRepository.findMembership).mockReset();
  vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
  vi.mocked(userRepository.getOrganizationRole).mockReset();
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
});

describe("GET /graph/node/[nodeType]/[nodeId]", () => {
  it("returns the node", async () => {
    const response = await nodeRoute.GET(
      new Request(`${BASE}/node/REQUIREMENT/${requirement.id}`),
      nodeParams(requirement),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      node: {
        type: "REQUIREMENT",
        id: "req1",
        projectId: PROJECT,
        identifier: "REQ1",
        label: "REQUIREMENT req1",
      },
    });
  });

  it("404s for an unknown node", async () => {
    const response = await nodeRoute.GET(new Request(`${BASE}/node/REQUIREMENT/ghost`), {
      params: Promise.resolve({ projectId: PROJECT, nodeType: "REQUIREMENT", nodeId: "ghost" }),
    });

    expect(response.status).toBe(404);
  });

  it("400s for a node type that is not in the registry", async () => {
    const response = await nodeRoute.GET(new Request(`${BASE}/node/SPACECRAFT/x`), {
      params: Promise.resolve({ projectId: PROJECT, nodeType: "SPACECRAFT", nodeId: "x" }),
    });

    expect(response.status).toBe(400);
  });

  it("404s when the project is not in the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    const response = await nodeRoute.GET(
      new Request(`${BASE}/node/REQUIREMENT/${requirement.id}`),
      nodeParams(requirement),
    );

    // Not 403 — the API does not confirm what it will not show.
    expect(response.status).toBe(404);
  });

  it("401s when there is no session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const response = await nodeRoute.GET(
      new Request(`${BASE}/node/REQUIREMENT/${requirement.id}`),
      nodeParams(requirement),
    );

    expect(response.status).toBe(401);
  });
});

describe("GET /graph/node/[nodeType]/[nodeId]/neighbors", () => {
  it("returns both directions by default", async () => {
    const response = await neighborsRoute.GET(
      new Request(`${BASE}/node/REQUIREMENT/${requirement.id}/neighbors`),
      nodeParams(requirement),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.node.id).toBe("req1");
    expect(body.connections).toHaveLength(4);
  });

  it("honours the direction parameter", async () => {
    const response = await neighborsRoute.GET(
      new Request(`${BASE}/node/REQUIREMENT/${requirement.id}/neighbors?direction=OUTBOUND`),
      nodeParams(requirement),
    );
    const body = await response.json();

    expect(body.connections).toHaveLength(2);
    expect(body.connections.every((c: { direction: string }) => c.direction === "OUTBOUND")).toBe(
      true,
    );
  });

  it("honours repeated edgeType parameters", async () => {
    const response = await neighborsRoute.GET(
      new Request(
        `${BASE}/node/REQUIREMENT/${requirement.id}/neighbors` +
          "?edgeType=REQUIREMENT_VERIFIED_BY&edgeType=RISK_AFFECTS_REQUIREMENT",
      ),
      nodeParams(requirement),
    );
    const body = await response.json();

    expect(body.connections.map((c: { neighbor: { id: string } }) => c.neighbor.id).sort()).toEqual(
      ["risk1", "va1"],
    );
  });

  it("400s for an invalid direction", async () => {
    const response = await neighborsRoute.GET(
      new Request(`${BASE}/node/REQUIREMENT/${requirement.id}/neighbors?direction=SIDEWAYS`),
      nodeParams(requirement),
    );

    expect(response.status).toBe(400);
  });

  it("400s for an unknown edge type", async () => {
    const response = await neighborsRoute.GET(
      new Request(`${BASE}/node/REQUIREMENT/${requirement.id}/neighbors?edgeType=NONSENSE`),
      nodeParams(requirement),
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /graph/traverse", () => {
  it("traverses from the given root", async () => {
    const response = await traverseRoute.POST(
      traverseRequest({ root: nodeRef(requirement), direction: "OUTBOUND" }),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.root.id).toBe("req1");
    expect(body.nodes.map((n: { node: { id: string } }) => n.node.id)).toEqual([
      "req1",
      "di1",
      "va1",
      "if1",
    ]);
    expect(body.limits.truncated).toBe(false);
  });

  it("reports the path and its provenance", async () => {
    const response = await traverseRoute.POST(
      traverseRequest({ root: nodeRef(requirement), direction: "OUTBOUND" }),
      projectParams,
    );
    const body = await response.json();

    const iface = body.nodes.find((n: { node: { id: string } }) => n.node.id === "if1");
    expect(iface.depth).toBe(2);
    expect(iface.path.map((s: { relationshipId: string }) => s.relationshipId)).toEqual([
      "relReqDesign",
      "relDesignIf",
    ]);
  });

  it("400s when the request asks for more depth than the cap allows", async () => {
    const response = await traverseRoute.POST(
      traverseRequest({ root: nodeRef(requirement), maxDepth: 50 }),
      projectParams,
    );

    // Rejected, not silently clamped.
    expect(response.status).toBe(400);
  });

  it("400s for an unknown property", async () => {
    const response = await traverseRoute.POST(
      traverseRequest({ root: nodeRef(requirement), followEverything: true }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("400s when the root is missing", async () => {
    const response = await traverseRoute.POST(traverseRequest({ direction: "BOTH" }), projectParams);

    expect(response.status).toBe(400);
  });

  it("404s for a root that is not in the project", async () => {
    const response = await traverseRoute.POST(
      traverseRequest({ root: { type: "REQUIREMENT", id: "ghost" } }),
      projectParams,
    );

    expect(response.status).toBe(404);
  });

  it("401s when there is no session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const response = await traverseRoute.POST(
      traverseRequest({ root: nodeRef(requirement) }),
      projectParams,
    );

    expect(response.status).toBe(401);
  });
});

describe("GET /graph/consistency", () => {
  it("returns a clean report for a sound project", async () => {
    const response = await consistencyRoute.GET(new Request(`${BASE}/consistency`), projectParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.anomalies).toEqual([]);
    // Derived from the registry: adding an edge type should extend the check,
    // not break this assertion.
    expect(body.report.checkedEdgeTypes).toHaveLength(GRAPH_EDGE_TYPES.length);
  });

  it("returns 200 with the anomalies it found, not an error", async () => {
    fixture.audit.set("REQUIREMENT_ALLOCATED_TO_DESIGN", [
      {
        type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
        relationshipId: "relCross",
        source: nodeRef(requirement),
        target: { type: "DESIGN_ITEM", id: "di-elsewhere" },
        targetProjectId: "proj9aaaaaaaaaaaaaaaaaa",
        linkType: null,
      },
    ]);

    const response = await consistencyRoute.GET(
      new Request(`${BASE}/consistency?edgeType=REQUIREMENT_ALLOCATED_TO_DESIGN`),
      projectParams,
    );
    const body = await response.json();

    // A successful check that found problems is still a successful check.
    expect(response.status).toBe(200);
    expect(body.report.anomalies).toHaveLength(1);
    expect(body.report.anomalies[0].kind).toBe("CROSS_PROJECT_ENDPOINT");
  });

  it("narrows the scan to the requested edge types", async () => {
    const response = await consistencyRoute.GET(
      new Request(`${BASE}/consistency?edgeType=RISK_AFFECTS_DESIGN&edgeType=ISSUE_AFFECTS_DESIGN`),
      projectParams,
    );
    const body = await response.json();

    expect(body.report.checkedEdgeTypes).toEqual([
      "RISK_AFFECTS_DESIGN",
      "ISSUE_AFFECTS_DESIGN",
    ]);
  });

  it("400s for an unknown edge type", async () => {
    const response = await consistencyRoute.GET(
      new Request(`${BASE}/consistency?edgeType=NOPE`),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("404s when the project is not in the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    const response = await consistencyRoute.GET(new Request(`${BASE}/consistency`), projectParams);

    expect(response.status).toBe(404);
  });
});
