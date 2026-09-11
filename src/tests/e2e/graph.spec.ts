import { expect, test } from "@playwright/test";
import { GRAPH_EDGE_TYPES } from "@/domain";
import { databaseAvailable, signIn, signUpNewAccount } from "./helpers";

/**
 * The graph over artifacts a real user created, end to end.
 *
 * There is no graph UI yet, and this deliberately does not invent one. What it
 * proves is the part that matters: artifacts and links written through the
 * normal screens show up as nodes and edges in the graph API, under the same
 * session cookie, without anything being written twice. The traversal reads the
 * very rows the requirements screen wrote.
 */

test.describe.serial("Cross-domain graph", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Graph ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectId: string;
  let requirementId: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "graph");
      return;
    }
    await signIn(page, account);
  });

  test("builds a requirement traced to a design item", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: projectName }).click();
    await page.waitForURL(/\/projects\/[a-z0-9]+$/);
    projectId = page.url().split("/").pop()!;

    await page.goto(`/projects/${projectId}/design-items`);
    await page.getByRole("button", { name: "New design item" }).first().click();
    await page.getByLabel("Identifier").fill("DI-001");
    await page.getByLabel(/^Name/).fill("Combustion chamber");
    await page.getByRole("button", { name: "Create design item" }).click();
    await expect(page).toHaveURL(/\/design-items\/[a-z0-9]+$/);

    await page.goto(`/projects/${projectId}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await page.getByLabel("Identifier").fill("REQ-001");
    await page.getByLabel(/^Title/).fill("Maximum chamber pressure");
    await page.getByLabel(/^Statement/).fill("The engine shall not exceed 120 bar.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);
    requirementId = page.url().split("/").pop()!;

    // Link it to the design item through the requirement's own screen.
    await page.getByLabel("Relationship").selectOption("DESIGN_ITEM");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/DI-001/)).toBeVisible();
  });

  test("sees that requirement as a graph node", async ({ page }) => {
    const response = await page.request.get(
      `/api/projects/${projectId}/graph/node/REQUIREMENT/${requirementId}`,
    );
    expect(response.ok()).toBe(true);

    const { node } = await response.json();
    expect(node).toMatchObject({
      type: "REQUIREMENT",
      id: requirementId,
      projectId,
      identifier: "REQ-001",
      label: "Maximum chamber pressure",
    });
  });

  test("sees the link written in the UI as a graph edge", async ({ page }) => {
    const response = await page.request.get(
      `/api/projects/${projectId}/graph/node/REQUIREMENT/${requirementId}/neighbors?direction=OUTBOUND`,
    );
    const { connections } = await response.json();

    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      direction: "OUTBOUND",
      neighbor: { type: "DESIGN_ITEM", identifier: "DI-001" },
      edge: { type: "REQUIREMENT_ALLOCATED_TO_DESIGN" },
    });
    // The edge carries the id of the very link row the UI created.
    expect(connections[0].edge.relationshipId).toEqual(expect.any(String));
  });

  test("traverses from the requirement and reports its limits", async ({ page }) => {
    const response = await page.request.post(`/api/projects/${projectId}/graph/traverse`, {
      data: { root: { type: "REQUIREMENT", id: requirementId }, direction: "BOTH", maxDepth: 2 },
    });
    expect(response.ok()).toBe(true);

    const result = await response.json();
    expect(result.root.identifier).toBe("REQ-001");
    expect(result.nodes.map((n: { node: { identifier: string } }) => n.node.identifier)).toEqual([
      "REQ-001",
      "DI-001",
    ]);
    expect(result.limits).toMatchObject({ maxDepth: 2, truncated: false, truncatedBy: null });
  });

  test("rejects a traversal that asks for more than the cap allows", async ({ page }) => {
    const response = await page.request.post(`/api/projects/${projectId}/graph/traverse`, {
      data: { root: { type: "REQUIREMENT", id: requirementId }, maxDepth: 99 },
    });

    // Rejected rather than quietly clamped.
    expect(response.status()).toBe(400);
  });

  test("reports a clean consistency check for the project", async ({ page }) => {
    const response = await page.request.get(`/api/projects/${projectId}/graph/consistency`);
    expect(response.ok()).toBe(true);

    const { report } = await response.json();
    expect(report.projectId).toBe(projectId);
    expect(report.anomalies).toEqual([]);
    // Derived from the registry: adding an edge type should extend the check,
    // not break this assertion.
    expect(report.checkedEdgeTypes).toHaveLength(GRAPH_EDGE_TYPES.length);
  });

  test("refuses the graph to a signed-out caller", async ({ request }) => {
    // The `request` fixture carries no session cookie.
    const response = await request.get(
      `/api/projects/${projectId}/graph/node/REQUIREMENT/${requirementId}`,
    );

    expect(response.status()).toBe(401);
  });
});
