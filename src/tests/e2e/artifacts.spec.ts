import { expect, test } from "@playwright/test";
import { databaseAvailable, signUpNewAccount, fillRecordNumber } from "./helpers";

/**
 * The full foundational chain, end to end:
 *
 *   sign in → project → stakeholder need → design item → verification
 *   activity → requirement → link the requirement to all three → verify the
 *   links appear on the requirement
 *
 * Every step writes to PostgreSQL through the real API, so the file skips by
 * name when no database is reachable. Nothing here is simulated.
 */

test.describe.serial("Foundational artifacts and traceability", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Artifacts ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "artifacts");
      return;
    }

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard$/);
  });

  test("creates a project and reaches its engineering workspace", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: projectName }).click();
    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);
    projectUrl = page.url();

    // All four implemented modules are linked and openable.
    for (const label of ["Requirements", "Stakeholder needs", "Design items", "Verification"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("creates a stakeholder need", async ({ page }) => {
    await page.goto(`${projectUrl}/stakeholder-needs`);
    await expect(page.getByText("No stakeholder needs yet")).toBeVisible();

    await page.getByRole("button", { name: "New stakeholder need" }).first().click();
    await fillRecordNumber(page, "SN-001");
    await page.getByLabel(/^Title/).fill("Payload mass capability");
    await page.getByLabel(/^Stakeholder/).fill("Launch customer");
    await page.getByLabel(/^Description/).fill("The launch customer needs 4 t to LEO.");
    await page.getByRole("button", { name: "Create need" }).click();

    await expect(page).toHaveURL(/\/stakeholder-needs\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: /SN-001/ })).toBeVisible();
  });

  test("creates a design item and assigns an owner", async ({ page }) => {
    await page.goto(`${projectUrl}/design-items`);

    await page.getByRole("button", { name: "New design item" }).first().click();
    await fillRecordNumber(page, "DI-001");
    await page.getByLabel(/^Name/).fill("Combustion chamber");
    await page.getByLabel(/^Item type/).selectOption("COMPONENT");
    await page.getByRole("button", { name: "Create design item" }).click();

    await expect(page).toHaveURL(/\/design-items\/[a-z0-9]+$/);
    await page.getByLabel("Assign owner").selectOption({ index: 1 });
    await expect(page.getByText(account.email, { exact: false })).toBeVisible();
  });

  test("creates a verification activity and starts it", async ({ page }) => {
    await page.goto(`${projectUrl}/verification`);

    await page.getByRole("button", { name: "New check" }).first().click();
    await fillRecordNumber(page, "VER-001");
    await page.getByLabel(/^Title/).fill("Chamber pressure hot-fire test");
    await page.getByLabel(/^How will it be checked/).selectOption("TEST");
    await page.getByText("More details (optional)").click();
    await page.getByLabel(/^Planned date/).fill("2026-04-01");
    await page.getByRole("button", { name: "Create check" }).click();

    await expect(page).toHaveURL(/\/verification\/[a-z0-9]+$/);
    await expect(page.getByRole("button", { name: "Record pass" })).toHaveCount(0);

    await page.getByRole("button", { name: "Start" }).click();
    // Now that it is running, an outcome can be recorded.
    await expect(page.getByRole("button", { name: "Record pass" })).toBeVisible();
  });

  test("creates a requirement and links it to all three artifacts", async ({ page }) => {
    await page.goto(`${projectUrl}/requirements`);

    await page.getByRole("button", { name: "New requirement" }).first().click();
    await fillRecordNumber(page, "REQ-001");
    await page.getByLabel("Short name").fill("Maximum chamber pressure");
    await page.getByLabel("What must it do?").fill("The engine shall not exceed 120 bar.");
    await page.getByRole("button", { name: "Create requirement" }).click();

    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);

    // The selectors are populated from real, project-scoped records.
    for (const relation of ["STAKEHOLDER_NEED", "DESIGN_ITEM", "VERIFICATION_ACTIVITY"]) {
      await page.getByLabel("Relationship").selectOption(relation);
      await page.getByLabel("Artifact").selectOption({ index: 1 });
      await page.getByRole("button", { name: /add link/i }).click();
    }

    await expect(page.getByText(/SN-001/)).toBeVisible();
    await expect(page.getByText(/DI-001/)).toBeVisible();
    await expect(page.getByText(/VER-001/)).toBeVisible();
  });

  test("shows the requirement from each artifact's own page", async ({ page }) => {
    await page.goto(`${projectUrl}/stakeholder-needs`);
    await page.getByRole("link", { name: "SN-001" }).click();
    await expect(page.getByText(/REQ-001/)).toBeVisible();

    await page.goto(`${projectUrl}/design-items`);
    await page.getByRole("link", { name: "DI-001" }).click();
    await expect(page.getByText(/REQ-001/)).toBeVisible();

    await page.goto(`${projectUrl}/verification`);
    await page.getByRole("link", { name: "VER-001" }).click();
    await expect(page.getByText(/REQ-001/)).toBeVisible();
  });

  test("removes a link and it disappears from both ends", async ({ page }) => {
    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("link", { name: "REQ-001" }).click();

    await page.getByRole("button", { name: /remove link to DI-001/i }).click();
    await expect(page.getByText(/DI-001/)).toHaveCount(0);

    await page.goto(`${projectUrl}/design-items`);
    await page.getByRole("link", { name: "DI-001" }).click();
    await expect(page.getByText(/No requirements are allocated/i)).toBeVisible();
  });
});
