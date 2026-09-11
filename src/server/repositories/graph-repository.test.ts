// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DbClient } from "@/lib/db";
import { EngineeringGraphRepository } from "./graph-repository";

/**
 * Which tables the repository touches, and which it leaves alone.
 *
 * The recorder below is a call log, not a database: every query returns an
 * empty result. What is being tested is the routing — that the edge registry
 * genuinely narrows a read to the relationship tables that could hold an edge
 * for the node types in hand, instead of sweeping all twenty-two. The queries
 * themselves are exercised for real against PostgreSQL in
 * `src/tests/integration/graph.test.ts`.
 */
function recordingClient(): { client: DbClient; delegates: string[] } {
  const delegates: string[] = [];
  const client = new Proxy(
    {},
    {
      get(_target, delegate: string) {
        return {
          findMany: async () => {
            delegates.push(delegate);
            return [];
          },
          findFirst: async () => {
            delegates.push(delegate);
            return null;
          },
        };
      },
    },
  ) as DbClient;

  return { client, delegates };
}

const PROJECT = "proj1aaaaaaaaaaaaaaaaaa";

describe("edge reads", () => {
  it("queries only the one table a stakeholder need can have edges in", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    await repository.getOutgoingEdges(PROJECT, [{ type: "STAKEHOLDER_NEED", id: "sn1" }]);

    expect(delegates).toEqual(["needRequirementLink"]);
  });

  it("queries nothing at all when nothing can point at the node type", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    // Nothing in the schema targets a stakeholder need.
    await repository.getIncomingEdges(PROJECT, [{ type: "STAKEHOLDER_NEED", id: "sn1" }]);

    expect(delegates).toEqual([]);
  });

  it("queries every relationship a requirement can take part in", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    await repository.getEdges(PROJECT, [{ type: "REQUIREMENT", id: "req1" }], "BOTH");

    expect(new Set(delegates)).toEqual(
      new Set([
        "requirementLink",
        "requirementDesignLink",
        "requirementVerificationLink",
        "requirementDecisionLink",
        "evidenceLink",
        "needRequirementLink",
        "riskRequirementLink",
        "issueRequirementLink",
        "changeRequestImpact",
        "approval",
        // A supplied item can support a requirement, so that join table is read
        // when a requirement's inbound edges are resolved.
        "suppliedItemRequirementLink",
        // A requirement can be baselined, and a drift finding can concern one,
        // so both drift tables are read for a requirement's inbound edges.
        "engineeringBaselineMember",
        "driftFinding",
        // A compliance item can be linked to a requirement, and a certification
        // review finding can concern one, so both certification tables are
        // read for a requirement's inbound edges.
        "complianceItemRequirementLink",
        "certificationReviewFinding",
      ]),
    );
  });

  it("narrows further when the caller names edge types", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    await repository.getOutgoingEdges(PROJECT, [{ type: "REQUIREMENT", id: "req1" }], [
      "REQUIREMENT_VERIFIED_BY",
    ]);

    expect(delegates).toEqual(["requirementVerificationLink"]);
  });

  it("ignores an edge-type filter that cannot apply to the node", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    await repository.getOutgoingEdges(PROJECT, [{ type: "REQUIREMENT", id: "req1" }], [
      "DESIGN_CONNECTS_INTERFACE",
    ]);

    expect(delegates).toEqual([]);
  });

  it("issues one query per table for a mixed frontier, not one per node", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    await repository.getOutgoingEdges(PROJECT, [
      { type: "DESIGN_ITEM", id: "di1" },
      { type: "DESIGN_ITEM", id: "di2" },
      { type: "DESIGN_ITEM", id: "di3" },
    ]);

    // Three nodes, two relationship tables, two queries.
    expect(delegates.sort()).toEqual(["designInterfaceLink", "designItemLink"]);
  });

  it("does nothing for an empty frontier", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    expect(await repository.getEdges(PROJECT, [], "BOTH")).toEqual([]);
    expect(delegates).toEqual([]);
  });
});

describe("node reads", () => {
  it("queries one table per node type, not one per node", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    await repository.resolveNodes(PROJECT, [
      { type: "REQUIREMENT", id: "req1" },
      { type: "REQUIREMENT", id: "req2" },
      { type: "DESIGN_ITEM", id: "di1" },
    ]);

    expect(delegates.sort()).toEqual(["designItem", "requirement"]);
  });

  it("returns null for a node the database does not hand back", async () => {
    const { client } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    expect(await repository.getNode(PROJECT, { type: "REQUIREMENT", id: "req1" })).toBeNull();
  });

  it("drops edges whose endpoints do not resolve", async () => {
    const { client } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    // No node resolves, so no edge survives: the graph fails closed rather than
    // reporting an edge to something it cannot see.
    const { edges } = await repository.materializeEdges(PROJECT, [
      {
        type: "REQUIREMENT_VERIFIED_BY",
        relationshipId: "rel1",
        createdAt: new Date(0),
        createdById: null,
        note: null,
        linkType: null,
        source: { type: "REQUIREMENT", id: "req1" },
        target: { type: "VERIFICATION_ACTIVITY", id: "va1" },
      },
    ]);

    expect(edges).toEqual([]);
  });
});

describe("risk and issue routing", () => {
  it("queries every table a risk can have outgoing edges in", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    await repository.getOutgoingEdges(PROJECT, [{ type: "RISK", id: "risk1" }]);

    expect(new Set(delegates)).toEqual(new Set(["riskRequirementLink", "riskDesignLink"]));
  });

  it("queries every table that can point *at* a risk", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    await repository.getIncomingEdges(PROJECT, [{ type: "RISK", id: "risk1" }]);

    // A decision can affect it, a change can declare it impacted, a supplied
    // item can be linked to it, and a compliance item can link to it as
    // supporting context — none of those is risk's own outgoing edge.
    expect(new Set(delegates)).toEqual(
      new Set(["decisionRiskLink", "changeRequestImpact", "suppliedItemRiskLink", "complianceItemRiskLink"]),
    );
  });

  it("queries every table an issue can have outgoing edges in", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    await repository.getOutgoingEdges(PROJECT, [{ type: "ISSUE", id: "issue1" }]);

    expect(new Set(delegates)).toEqual(new Set(["issueRequirementLink", "issueDesignLink"]));
  });

  it("queries every table that can point *at* an issue", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    await repository.getIncomingEdges(PROJECT, [{ type: "ISSUE", id: "issue1" }]);

    expect(new Set(delegates)).toEqual(
      new Set(["decisionIssueLink", "changeRequestImpact", "complianceItemIssueLink"]),
    );
  });

  it("resolves risk and issue nodes from their own tables, not one per row", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    await repository.resolveNodes(PROJECT, [
      { type: "RISK", id: "risk1" },
      { type: "RISK", id: "risk2" },
      { type: "ISSUE", id: "issue1" },
    ]);

    expect(delegates.sort()).toEqual(["issue", "risk"]);
  });
});

describe("the consistency scan", () => {
  it("audits exactly the edge types it was given", async () => {
    const { client, delegates } = recordingClient();
    const repository = new EngineeringGraphRepository(client);

    const audited = await repository.auditEdges(PROJECT, [
      "RISK_AFFECTS_DESIGN",
      "ISSUE_AFFECTS_DESIGN",
    ]);

    expect([...audited.keys()]).toEqual(["RISK_AFFECTS_DESIGN", "ISSUE_AFFECTS_DESIGN"]);
    expect(delegates.sort()).toEqual(["issueDesignLink", "riskDesignLink"]);
  });
});
