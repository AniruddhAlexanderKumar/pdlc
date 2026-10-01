import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount, signOut } from "./helpers";

/**
 * The Traceability workspace, end to end:
 *
 *   sign in → project → build a small traced slice (a requirement linked to
 *   a design item and a decision, a risk linked to the requirement, and a
 *   second issue reached only through the decision) → open Traceability →
 *   inspect the requirement's direct relationships, both directions → filter
 *   by direction → traverse into a connected object and back → run the
 *   bounded extended-neighborhood traversal and confirm it reaches a real
 *   two-hop object with a real shortest path → confirm project isolation
 *   through the real API.
 *
 * Every object here is created through the real UI and the real API; this
 * spec never asserts on a fabricated relationship.
 */

test.describe.serial("Traceability workspace", () => {
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let requirementUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "traceability");
      return;
    }
    await signIn(page, account);
  });

  test("builds a traced slice: requirement, design item, decision, risk and a second issue reached only through the decision", async ({
    page,
  }) => {
    const projectName = `[E2E] Traceability ${Date.now()}`;
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: projectName }).click();
    await page.waitForURL(/\/projects\/[a-z0-9]+$/);
    projectUrl = page.url();

    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await page.getByLabel("Identifier").fill("REQ-001");
    await page.getByLabel(/^Title/).fill("Maximum chamber pressure");
    await page.getByLabel(/^Statement/).fill("The engine shall not exceed 120 bar.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);
    requirementUrl = page.url();

    await page.goto(`${projectUrl}/design-items`);
    await page.getByRole("button", { name: "New design item" }).first().click();
    await page.getByLabel("Identifier").fill("DI-001");
    await page.getByLabel(/^Name/).fill("Combustion chamber");
    await page.getByRole("button", { name: "Create design item" }).click();
    await expect(page).toHaveURL(/\/design-items\/[a-z0-9]+$/);

    await page.goto(`${projectUrl}/decisions`);
    await page.getByRole("button", { name: "New decision" }).first().click();
    await page.getByLabel("Identifier").fill("ED-001");
    await page.getByLabel(/^Title/).fill("Use regenerative cooling");
    await page.getByLabel(/^Statement/).fill("The chamber will be regeneratively cooled.");
    await page.getByLabel(/^Rationale/).fill("Ablative liner mass was prohibitive.");
    await page.getByRole("button", { name: "Create decision" }).click();
    await expect(page).toHaveURL(/\/decisions\/[a-z0-9]+$/);
    const decisionUrl = page.url();

    await page.goto(`${projectUrl}/risks`);
    await page.getByRole("button", { name: "New risk" }).first().click();
    await page.getByLabel("Identifier").fill("RSK-001");
    await page.getByLabel(/^Title/).fill("Coolant supply interruption");
    await page.getByLabel(/^Description/).fill("The coolant loop may lose flow under vibration.");
    await page.getByRole("button", { name: "Create risk" }).click();
    await expect(page).toHaveURL(/\/risks\/[a-z0-9]+$/);
    await page.getByLabel("Relationship").selectOption("REQUIREMENT");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/REQ-001/)).toBeVisible();

    await page.goto(`${projectUrl}/issues`);
    await page.getByRole("button", { name: "New issue" }).first().click();
    await page.getByLabel("Identifier").fill("ISS-002");
    await page.getByLabel(/^Title/).fill("Ablative liner mass estimate");
    await page.getByLabel(/^Description/).fill("The original mass estimate for the rejected option was wrong.");
    await page.getByLabel(/^Severity/).selectOption("LOW");
    await page.getByRole("button", { name: "Create issue" }).click();
    await expect(page).toHaveURL(/\/issues\/[a-z0-9]+$/);

    // Reached from the requirement only through the decision: two hops away,
    // not one — this is what the extended-neighborhood traversal proves below.
    await page.goto(decisionUrl);
    await page.getByLabel("Relationship").selectOption("ISSUE");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/ISS-002/)).toBeVisible();

    await page.goto(requirementUrl);
    await page.getByLabel("Relationship").selectOption("DESIGN_ITEM");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/DI-001/)).toBeVisible();

    await page.getByLabel("Relationship").selectOption("ENGINEERING_DECISION");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByLabel("Link type").selectOption("DECISION_ADDRESSES_REQUIREMENT");
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/ED-001/)).toBeVisible();
  });

  test("opens the requirement and inspects its direct relationships in both directions", async ({ page }) => {
    await page.goto(`${projectUrl}/traceability`);
    await expect(page.getByRole("heading", { name: "Traceability" })).toBeVisible();

    await page.getByLabel("Object type").selectOption("REQUIREMENT");
    await page.getByLabel("Object").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Open" }).click();

    await expect(page.getByText("Currently inspecting")).toBeVisible();
    await expect(page.getByText(/REQ-001/).first()).toBeVisible();

    const outbound = page.getByText("Outbound — what this affects").locator("..");
    await expect(outbound.getByText(/DI-001/)).toBeVisible();
    await expect(outbound.getByText(/ED-001/)).toBeVisible();

    const inbound = page.getByText("Inbound — what affects this").locator("..");
    await expect(inbound.getByText(/RSK-001/)).toBeVisible();
    await expect(inbound.getByText("Risk affects requirement", { exact: false })).toBeVisible();
  });

  test("narrows to one direction on request", async ({ page }) => {
    await page.goto(`${projectUrl}/traceability`);
    await page.getByLabel("Object type").selectOption("REQUIREMENT");
    await page.getByLabel("Object").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page.getByText("Currently inspecting")).toBeVisible();

    await page.getByRole("button", { name: "Outbound", exact: true }).click();

    await expect(page.getByText(/DI-001/)).toBeVisible();
    await expect(page.getByText("Inbound — what affects this")).toHaveCount(0);
  });

  test("traverses into a connected object and back", async ({ page }) => {
    await page.goto(`${projectUrl}/traceability`);
    await page.getByLabel("Object type").selectOption("REQUIREMENT");
    await page.getByLabel("Object").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page.getByText("Currently inspecting")).toBeVisible();

    await page.getByRole("button", { name: /DI-001/ }).click();

    await expect(page.getByRole("navigation", { name: "Traceability path" }).getByText("REQ-001")).toBeVisible();
    // The current object card now names the design item, not the requirement.
    const currentCard = page.getByText("Currently inspecting").locator("../..");
    await expect(currentCard.getByText(/DI-001/)).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();

    const restoredCard = page.getByText("Currently inspecting").locator("../..");
    await expect(restoredCard.getByText(/REQ-001/)).toBeVisible();
  });

  test("the extended neighborhood reaches a real two-hop object with a real shortest path", async ({ page }) => {
    await page.goto(`${projectUrl}/traceability`);
    await page.getByLabel("Object type").selectOption("REQUIREMENT");
    await page.getByLabel("Object").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page.getByText("Currently inspecting")).toBeVisible();

    await page.getByLabel("Depth").selectOption("2");
    await page.getByRole("button", { name: "Run traversal" }).click();

    const issueRow = page.getByText(/ISS-002/);
    await expect(issueRow).toBeVisible();
    await expect(page.getByText("2 hops away")).toBeVisible();
  });

  test("keeps traceability project-isolated for another organization", async ({ page }) => {
    const requirementId = new URL(requirementUrl).pathname.split("/").pop();
    const projectId = new URL(projectUrl).pathname.split("/").pop();
    const apiBase = new URL(requirementUrl).origin;

    await signOut(page);
    await signUpNewAccount(page, "traceability-other");

    const response = await page.request.get(
      `${apiBase}/api/projects/${projectId}/graph/node/REQUIREMENT/${requirementId}`,
    );
    expect(response.status()).toBe(404);

    await page.goto(`${apiBase}/projects/${projectId}/traceability`);
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
