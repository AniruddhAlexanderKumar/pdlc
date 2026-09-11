import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount } from "./helpers";

/**
 * Change management, end to end:
 *
 *   sign in → project → artifacts to declare against → create change →
 *   declare requirement / design / decision impacts → history →
 *   DRAFT → SUBMITTED → UNDER_REVIEW
 *
 * Every step writes to PostgreSQL through the real API. Nothing here computes
 * impact, and the spec asserts that the page says so — the next capability
 * builds that, and until it does the product must not imply otherwise.
 */

test.describe.serial("Change requests", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Changes ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let changeUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "changes");
      return;
    }
    await signIn(page, account);
  });

  test("creates a project with artifacts a change can affect", async ({ page }) => {
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

  test("raises a change request in draft", async ({ page }) => {
    await page.goto(`${projectUrl}/changes`);
    await expect(page.getByText("No change requests raised yet")).toBeVisible();

    await page.getByRole("button", { name: "New change" }).first().click();
    await page.getByLabel(/^Identifier/).fill("CR-001");
    await page.getByLabel(/^Title/).fill("Raise the chamber pressure limit");
    await page.getByLabel(/^Description/).fill("Raise the limit from 120 to 130 bar.");
    await page.getByLabel(/^Reason/).fill("Performance shortfall found in hot fire.");
    await page.getByRole("button", { name: "Create change request" }).click();

    await expect(page).toHaveURL(/\/changes\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: /CR-001/ })).toBeVisible();
    // Always DRAFT; the client never chose it.
    await expect(page.getByText("Draft")).toBeVisible();

    changeUrl = page.url();
  });

  test("declares an impact on a requirement", async ({ page }) => {
    await page.goto(changeUrl);

    await page.getByLabel("Artifact type").selectOption("REQUIREMENT");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByLabel("Why is it affected?").fill("The pressure limit is stated here.");
    await page.getByRole("button", { name: /declare impact/i }).click();

    await expect(page.getByText("REQ-001")).toBeVisible();
    await expect(page.getByText("The pressure limit is stated here.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("REQ-001")).toBeVisible();
  });

  test("declares an impact on a design item", async ({ page }) => {
    await page.goto(changeUrl);

    await page.getByLabel("Artifact type").selectOption("DESIGN_ITEM");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /declare impact/i }).click();

    await expect(page.getByText("DI-001")).toBeVisible();
  });

  test("declares an impact on an engineering decision", async ({ page }) => {
    await page.goto(changeUrl);

    await page.getByLabel("Artifact type").selectOption("ENGINEERING_DECISION");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /declare impact/i }).click();

    await expect(page.getByText("ED-001")).toBeVisible();
  });

  test("calls them declared impacts and admits nothing has been computed", async ({ page }) => {
    await page.goto(changeUrl);

    await expect(page.getByRole("heading", { name: "Declared impacts" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Computed impact" })).toBeVisible();
    await expect(page.getByText(/has not computed the downstream impact/i)).toBeVisible();
    // No fabricated result anywhere on the page.
    await expect(page.getByText(/blast radius:/i)).toHaveCount(0);
    await expect(page.getByText(/risk score/i)).toHaveCount(0);
  });

  test("withdraws a declared impact and records it", async ({ page }) => {
    await page.goto(changeUrl);

    await page.getByRole("button", { name: /withdraw declared impact on ED-001/i }).click();
    await expect(page.getByText("ED-001")).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("ED-001")).toHaveCount(0);
  });

  test("shows the work in the change's history", async ({ page }) => {
    await page.goto(changeUrl);

    await expect(page.getByText("Created")).toBeVisible();
    await expect(page.getByText(/declared impact/i).first()).toBeVisible();
  });

  test("moves DRAFT → SUBMITTED → UNDER_REVIEW and freezes the definition", async ({ page }) => {
    await page.goto(changeUrl);

    // Approval is not reachable straight from DRAFT.
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Submitted")).toBeVisible();
    // Still editable while submitted.
    await expect(page.getByRole("button", { name: "Edit" })).toBeEnabled();

    await page.getByRole("button", { name: "Begin review" }).click();
    await expect(page.getByText("Under review")).toBeVisible();

    // The definition is now fixed…
    await expect(page.getByRole("button", { name: "Edit" })).toBeDisabled();
    await expect(page.getByRole("status")).toContainText(
      /must not silently become a different change/i,
    );

    // …but the declared scope is still open, which is what review is for.
    await expect(page.getByRole("button", { name: /declare impact/i })).toBeVisible();

    // Only now is approval offered.
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
  });

  test("shows the change in the project's change list", async ({ page }) => {
    await page.goto(`${projectUrl}/changes`);

    const row = page.getByRole("row", { name: /CR-001/ });
    await expect(row).toContainText("Raise the chamber pressure limit");
    await expect(row).toContainText("Under review");
    await expect(row).toContainText("E2E Engineer");
  });
});
