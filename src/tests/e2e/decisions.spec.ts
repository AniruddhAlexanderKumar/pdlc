import { expect, test } from "@playwright/test";
import { databaseAvailable, signUpNewAccount } from "./helpers";

/**
 * Decision memory, end to end:
 *
 *   sign in → project → create decision → alternatives → assumptions →
 *   expectation → link a requirement and a design item → history →
 *   PROPOSED → UNDER_REVIEW → APPROVED → approved-record restrictions
 *
 * Every step writes to PostgreSQL through the real API. In CI, where the
 * workflow provisions a PostgreSQL service, these run. Locally they skip only
 * when no database is reachable — never faked.
 */

test.describe.serial("Decision memory", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Decisions ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let decisionUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "decisions");
      return;
    }

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard$/);
  });

  test("creates a project with a requirement and a design item to trace to", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: projectName }).click();
    projectUrl = page.url();

    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await page.getByLabel("Identifier").fill("REQ-001");
    await page.getByLabel(/^Title/).fill("Maximum chamber pressure");
    await page.getByLabel(/^Statement/).fill("The engine shall not exceed 120 bar.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);

    await page.goto(`${projectUrl}/design-items`);
    await page.getByRole("button", { name: "New design item" }).first().click();
    await page.getByLabel("Identifier").fill("DI-001");
    await page.getByLabel(/^Name/).fill("Combustion chamber");
    await page.getByRole("button", { name: "Create design item" }).click();
    await expect(page).toHaveURL(/\/design-items\/[a-z0-9]+$/);
  });

  test("creates a decision", async ({ page }) => {
    await page.goto(`${projectUrl}/decisions`);
    await expect(page.getByText("No decisions recorded yet")).toBeVisible();

    await page.getByRole("button", { name: "New decision" }).first().click();
    await page.getByLabel("Identifier").fill("ED-001");
    await page.getByLabel(/^Title/).fill("Use regenerative cooling");
    await page.getByLabel(/^Statement/).fill("The chamber will be regeneratively cooled.");
    await page.getByLabel(/^Rationale/).fill("Ablative liner mass was prohibitive.");
    await page.getByRole("button", { name: "Create decision" }).click();

    await expect(page).toHaveURL(/\/decisions\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: /ED-001/ })).toBeVisible();
    await expect(page.getByText("Proposed")).toBeVisible();

    decisionUrl = page.url();
  });

  test("records an alternative that was rejected", async ({ page }) => {
    await page.goto(decisionUrl);

    await page.getByRole("button", { name: /add alternative/i }).click();
    await page.getByLabel(/^Alternative/).fill("Ablative liner");
    await page.getByLabel("Reason rejected").fill("Mass and refurbishment cost.");
    await page.getByRole("button", { name: "Add alternative" }).click();

    await expect(page.getByText("Ablative liner")).toBeVisible();
    await expect(page.getByText("Mass and refurbishment cost.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Ablative liner")).toBeVisible();
  });

  test("records an assumption, which starts unchecked", async ({ page }) => {
    await page.goto(decisionUrl);

    await page.getByRole("button", { name: /add assumption/i }).click();
    await page.getByLabel(/^Assumption/).fill("Coolant flow stays above 2.4 kg/s.");
    await page.getByRole("button", { name: "Add assumption" }).click();

    await expect(page.getByText("Coolant flow stays above 2.4 kg/s.")).toBeVisible();
    // Nothing has checked it, and the UI says so.
    await expect(page.getByText("Not checked").first()).toBeVisible();
  });

  test("records an expectation, which starts unobserved", async ({ page }) => {
    await page.goto(decisionUrl);

    await page.getByRole("button", { name: /set expectation/i }).click();
    await page.getByLabel(/^Expectation/).fill("Wall temperature stays below the material limit.");
    await page.getByLabel("Measure").fill("Peak wall temperature");
    await page.getByLabel("Expected value").fill("< 800");
    await page.getByLabel("Unit").fill("K");
    await page.getByRole("button", { name: /save expectation/i }).click();

    await expect(page.getByText("Expected")).toBeVisible();
    await expect(page.getByText("Observed")).toBeVisible();
    await expect(page.getByText("< 800 K")).toBeVisible();
    // No outcome is claimed.
    await expect(page.getByText("Not yet observed")).toBeVisible();
  });

  test("links the decision to a requirement and a design item", async ({ page }) => {
    await page.goto(decisionUrl);

    for (const relation of ["REQUIREMENT", "DESIGN_ITEM"]) {
      await page.getByLabel("Relationship").selectOption(relation);
      await page.getByLabel("Artifact").selectOption({ index: 1 });
      await page.getByRole("button", { name: /add link/i }).click();
    }

    await expect(page.getByText(/REQ-001/)).toBeVisible();
    await expect(page.getByText(/DI-001/)).toBeVisible();
  });

  test("shows the decision from the requirement and design item sides", async ({ page }) => {
    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("link", { name: "REQ-001" }).click();
    await expect(page.getByText(/ED-001/)).toBeVisible();

    await page.goto(`${projectUrl}/design-items`);
    await page.getByRole("link", { name: "DI-001" }).click();
    await expect(page.getByText(/ED-001/)).toBeVisible();
  });

  test("shows the work in the decision's history", async ({ page }) => {
    await page.goto(decisionUrl);

    await expect(page.getByText("Created")).toBeVisible();
    await expect(page.getByText("Alternative recorded")).toBeVisible();
    await expect(page.getByText("Assumption recorded")).toBeVisible();
    await expect(page.getByText("Expected outcome recorded")).toBeVisible();
  });

  test("moves through the lifecycle and locks the record on approval", async ({ page }) => {
    await page.goto(decisionUrl);

    // Approval is not reachable straight from PROPOSED.
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

    await page.getByRole("button", { name: "Begin review" }).click();
    await expect(page.getByText("Under review")).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved")).toBeVisible();

    // The substance is now fixed…
    await expect(page.getByRole("button", { name: "Edit" })).toBeDisabled();
    await expect(page.getByRole("status")).toContainText(/statement, rationale and alternatives are fixed/i);
    await expect(page.getByRole("button", { name: /add alternative/i })).toHaveCount(0);

    // …but assumptions remain open, which is when they get revisited.
    await expect(page.getByRole("button", { name: /add assumption/i })).toBeVisible();

    // Only supersession remains.
    await expect(page.getByRole("button", { name: "Supersede" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);
  });

  test("records an assumption as invalidated after approval", async ({ page }) => {
    await page.goto(decisionUrl);

    await page
      .getByLabel(/Status for Coolant flow stays above 2.4 kg\/s\./)
      .selectOption("INVALIDATED");

    await expect(page.getByText("Invalidated").first()).toBeVisible();
    await page.reload();
    await expect(page.getByText("Invalidated").first()).toBeVisible();
  });
});
