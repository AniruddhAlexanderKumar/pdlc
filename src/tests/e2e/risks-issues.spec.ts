import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount } from "./helpers";

/**
 * Risks and Issues, end to end:
 *
 *   sign in → project → create a Risk and an Issue → link each to a
 *   requirement, a design item and a decision → inspect the graph
 *   relationships from the requirement's own traceability panel → create a
 *   Change → declare it affects the Risk and the Issue → run impact
 *   analysis and inspect the results → modify the Risk → run Decision
 *   Sentinel detection and inspect the surveillance target it opens →
 *   inspect Technical Readiness consuming the real Risk/Issue records →
 *   inspect the Certification Workspace linking a compliance item to the
 *   Risk and the Issue.
 *
 * Every step writes to PostgreSQL through the real API and the real
 * engines. This spec never asserts a probability, an impact score or a risk
 * matrix, because the interface never renders one, and it never requires a
 * specific technical-readiness or certification verdict beyond what the
 * recorded data actually supports.
 */

test.describe.serial("Risks and Issues", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Risks Issues ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let requirementUrl: string;
  let riskUrl: string;
  let issueUrl: string;
  let changeUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "risks-issues");
      return;
    }
    await signIn(page, account);
  });

  test("builds a traced slice: requirement, design item and decision", async ({ page }) => {
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
  });

  test("creates a Risk and an Issue", async ({ page }) => {
    await page.goto(`${projectUrl}/risks`);
    await page.getByRole("button", { name: "New risk" }).first().click();
    await page.getByLabel("Identifier").fill("RSK-001");
    await page.getByLabel(/^Title/).fill("Coolant supply interruption");
    await page.getByLabel(/^Description/).fill("The coolant loop may lose flow under vibration.");
    await page.getByRole("button", { name: "Create risk" }).click();
    await expect(page).toHaveURL(/\/risks\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: /RSK-001/ })).toBeVisible();
    await expect(page.getByText("Open", { exact: true })).toBeVisible();
    riskUrl = page.url();

    await page.goto(`${projectUrl}/issues`);
    await page.getByRole("button", { name: "New issue" }).first().click();
    await page.getByLabel("Identifier").fill("ISS-001");
    await page.getByLabel(/^Title/).fill("Chamber wall crack found");
    await page.getByLabel(/^Description/).fill("A hairline crack was found during post-test inspection.");
    await page.getByLabel("Severity").selectOption("CRITICAL");
    await page.getByRole("button", { name: "Create issue" }).click();
    await expect(page).toHaveURL(/\/issues\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: /ISS-001/ })).toBeVisible();
    issueUrl = page.url();
  });

  test("links the Risk and the Issue to the requirement, design item and decision", async ({ page }) => {
    await page.goto(riskUrl);

    for (const [relation, label] of [
      ["REQUIREMENT", "REQ-001"],
      ["DESIGN_ITEM", "DI-001"],
      ["ENGINEERING_DECISION", "ED-001"],
    ] as const) {
      await page.getByLabel("Relationship").selectOption(relation);
      await page.getByLabel("Artifact").selectOption({ index: 1 });
      await page.getByRole("button", { name: /add link/i }).click();
      await expect(page.getByText(new RegExp(label))).toBeVisible();
    }

    await page.goto(issueUrl);
    await page.getByLabel("Relationship").selectOption("REQUIREMENT");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/REQ-001/)).toBeVisible();
  });

  test("the real graph resolves the risk and issue as inbound connections on the requirement", async ({
    page,
  }) => {
    // There is no graph visualization UI yet (deliberately not built), so
    // this inspects the real graph the same way the neighbors endpoint
    // itself is exercised: directly, through the real API.
    const requirementId = new URL(requirementUrl).pathname.split("/").pop();
    const apiBase = new URL(requirementUrl).origin;
    const response = await page.request.get(
      `${apiBase}/api/projects/${new URL(projectUrl).pathname.split("/").pop()}/graph/node/REQUIREMENT/${requirementId}/neighbors?direction=INBOUND`,
    );
    expect(response.ok()).toBe(true);

    const { connections } = await response.json();
    const types = connections.map((c: { neighbor: { type: string } }) => c.neighbor.type);
    expect(types).toContain("RISK");
    expect(types).toContain("ISSUE");

    const riskConnection = connections.find((c: { neighbor: { type: string } }) => c.neighbor.type === "RISK");
    expect(riskConnection.edge.type).toBe("RISK_AFFECTS_REQUIREMENT");
    expect(riskConnection.direction).toBe("INBOUND");
  });

  test("creates a Change and declares it affects the Risk and the Issue", async ({ page }) => {
    await page.goto(`${projectUrl}/changes`);
    await page.getByRole("button", { name: "New change" }).first().click();
    await page.getByLabel("Identifier").fill("CR-001");
    await page.getByLabel(/^Title/).fill("Raise the pressure limit");
    await page.getByLabel(/^Description/).fill("Raise the chamber pressure limit to 130 bar.");
    await page.getByLabel(/^Reason/).fill("Performance shortfall found in hot fire.");
    await page.getByRole("button", { name: "Create change request" }).click();
    await expect(page).toHaveURL(/\/changes\/[a-z0-9]+$/);
    changeUrl = page.url();

    await page.getByLabel("Artifact type").selectOption("RISK");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /declare impact/i }).click();
    await expect(page.getByText("RSK-001")).toBeVisible();

    await page.getByLabel("Artifact type").selectOption("ISSUE");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /declare impact/i }).click();
    await expect(page.getByText("ISS-001")).toBeVisible();
  });

  test("runs impact analysis and shows the Risk and Issue as directly declared", async ({ page }) => {
    await page.goto(changeUrl);

    await page.getByRole("button", { name: /run impact analysis/i }).click();
    await expect(page.getByLabel("Impact summary")).toBeVisible();

    const riskRow = page.getByRole("row", { name: /RSK-001/ });
    await expect(riskRow).toContainText("Direct");

    const issueRow = page.getByRole("row", { name: /ISS-001/ });
    await expect(issueRow).toContainText("Direct");
  });

  test("modifying the Risk, Decision Sentinel detects it and opens a real surveillance target", async ({
    page,
  }) => {
    await page.goto(riskUrl);
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page
      .getByLabel(/^Description/)
      .fill("The coolant loop may lose flow under vibration, revised after inspection.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/revised after inspection/)).toBeVisible();

    await page.goto(`${projectUrl}/sentinel`);
    await page.getByRole("button", { name: /run detection/i }).click();

    await expect(page.getByText(/change.* detected/i)).toBeVisible();
    // The change request's completed impact analysis already reached this
    // risk (it was declared impacted and the analysis ran in the previous
    // test), so a real Change Impact Analysis signal opens for it.
    await expect(page.getByText("Change Impact Analysis")).toBeVisible();
    await expect(page.getByText(/RSK-001/)).toBeVisible();
  });

  test("inspects Technical Readiness consuming the real Risk and Issue records", async ({ page }) => {
    await page.goto(projectUrl);

    await expect(page.getByRole("heading", { name: "Technical readiness" })).toBeVisible();
    await page.getByRole("button", { name: /evaluate gate/i }).click();

    // The CRITICAL, unresolved issue blocks every gate — a real rule reading
    // a real record, never a fabricated score.
    const issueRow = page.getByRole("row", { name: /TR-ISS-001/ });
    await expect(issueRow).toContainText("Blocking");

    // Open risks are recorded without being ranked.
    const riskRow = page.getByRole("row", { name: /TR-RSK-003|TR-RSK-002/ });
    await expect(riskRow).toBeVisible();

    await expect(page.getByText(/%/)).toHaveCount(0);
  });

  test("links a certification compliance item to the Risk and the Issue", async ({ page }) => {
    await page.goto(`${projectUrl}/certification`);
    await page.getByRole("button", { name: "Create programme" }).click();
    await page.getByLabel("Identifier").fill("CERT-001");
    await page.getByLabel("Name").fill("Cabin systems certification effort");
    await page.getByRole("button", { name: "Create programme" }).click();
    await expect(page.getByText("Cabin systems certification effort")).toBeVisible();

    await page.getByRole("button", { name: "New basis" }).click();
    await page.getByLabel("Identifier").fill("CB-001");
    await page.getByLabel("Title").fill("Part 25 Amdt 25-141");
    await page.getByLabel("Revision").fill("Amdt 25-141");
    await page.getByLabel("Source reference").fill("14 CFR Part 25");
    await page.getByRole("button", { name: "Record basis" }).click();
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();

    await page.goto(`${projectUrl}/certification/items`);
    await page.getByRole("button", { name: "New compliance item" }).click();
    await page.getByLabel("Identifier").fill("CI-001");
    await page.getByLabel("Title").fill("Coolant system integrity");
    await page.getByRole("button", { name: "Create item" }).click();
    await expect(page).toHaveURL(/\/certification\/items\/[a-z0-9]+$/);

    await page.getByRole("button", { name: "Add link" }).click();
    await page.getByLabel("Link type").selectOption("RISK");
    await page.getByLabel("Target").selectOption({ label: "RSK-001 — Coolant supply interruption" });
    await page.getByRole("dialog").getByRole("button", { name: "Add link" }).click();
    await expect(page.getByText(/RSK-001/)).toBeVisible();

    await page.getByRole("button", { name: "Add link" }).click();
    await page.getByLabel("Link type").selectOption("ISSUE");
    await page.getByLabel("Target").selectOption({ label: "ISS-001 — Chamber wall crack found" });
    await page.getByRole("dialog").getByRole("button", { name: "Add link" }).click();
    await expect(page.getByText(/ISS-001/)).toBeVisible();
  });

  test("never renders a probability, impact score or risk matrix anywhere in the Risks or Issues workspace", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/risks`);
    await expect(page.getByText(/probability|risk matrix|heatmap/i)).toHaveCount(0);

    await page.goto(riskUrl);
    await expect(page.getByText(/probability|risk matrix|heatmap|\d+%/i)).toHaveCount(0);

    await page.goto(`${projectUrl}/issues`);
    await expect(page.getByText(/probability|priority score/i)).toHaveCount(0);

    await page.goto(issueUrl);
    await expect(page.getByText(/probability|priority score|\d+%/i)).toHaveCount(0);
  });
});
