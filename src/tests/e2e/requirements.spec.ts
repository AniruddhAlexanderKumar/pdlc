import { expect, test } from "@playwright/test";
import { databaseAvailable, signUpNewAccount, fillRecordNumber } from "./helpers";

/**
 * Requirements module browser flow.
 *
 * Every step writes to or reads from PostgreSQL through the real API, so the
 * whole file skips by name when no database is reachable — nothing here is
 * simulated. Each run registers its own "[E2E]" organization and project.
 */

test.describe.serial("Requirement lifecycle", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Requirements ${stamp}`;
  const identifier = "REQ-001";
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let requirementsUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "requirements");
      return;
    }

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard$/);
  });

  test("creates a project to hold requirements", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: projectName }).click();
    await page.getByRole("link", { name: "Open" }).click();

    await expect(page).toHaveURL(/\/requirements$/);
    await expect(page.getByRole("heading", { name: "Requirements" })).toBeVisible();
    // A brand-new project genuinely has none.
    await expect(page.getByText("No requirements yet")).toBeVisible();

    requirementsUrl = page.url();
  });

  test("creates a requirement and opens its detail", async ({ page }) => {
    await page.goto(requirementsUrl);

    await page.getByRole("button", { name: "New requirement" }).first().click();
    await fillRecordNumber(page, identifier);
    await page.getByLabel("Short name").fill("Maximum chamber pressure");
    await page
      .getByLabel("What must it do?")
      .fill("The engine shall not exceed 120 bar chamber pressure.");
    await page.getByText("More details (optional)").click();
    await page.getByLabel("Why is it needed?").fill("Structural margin of the chamber wall.");
    await page.getByRole("button", { name: "Create requirement" }).click();

    // Creation navigates to the requirement that was actually created.
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: new RegExp(identifier) })).toBeVisible();
    await expect(page.getByText("Draft")).toBeVisible();
  });

  test("rejects a duplicate identifier in the same project", async ({ page }) => {
    await page.goto(requirementsUrl);

    await page.getByRole("button", { name: "New requirement" }).first().click();
    await fillRecordNumber(page, identifier);
    await page.getByLabel("Short name").fill("Duplicate attempt");
    await page.getByLabel("What must it do?").fill("This identifier is already taken.");
    await page.getByRole("button", { name: "Create requirement" }).click();

    await expect(page.getByRole("alert")).toContainText(/already exists/i);
  });

  test("edits the requirement while it is a draft", async ({ page }) => {
    await page.goto(requirementsUrl);
    await page.getByRole("link", { name: identifier }).click();

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Title").fill("Maximum chamber pressure (revised)");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("heading", { name: /revised/ })).toBeVisible();

    // Persisted, not just held in component state.
    await page.reload();
    await expect(page.getByRole("heading", { name: /revised/ })).toBeVisible();
  });

  test("assigns an owner from the organization", async ({ page }) => {
    await page.goto(requirementsUrl);
    await page.getByRole("link", { name: identifier }).click();

    await page.getByLabel("Assign owner").selectOption({ index: 1 });

    await expect(page.getByText(account.email, { exact: false })).toBeVisible();
  });

  test("moves through the lifecycle and refuses illegal jumps", async ({ page }) => {
    await page.goto(requirementsUrl);
    await page.getByRole("link", { name: identifier }).click();

    // DRAFT offers only In Review and Obsolete — Approve/Baseline are absent.
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Baseline" })).toHaveCount(0);

    await page.getByRole("button", { name: "Move to in review" }).click();
    await expect(page.getByText("In review")).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved")).toBeVisible();

    // Approved content is read-only, enforced server-side.
    await expect(page.getByRole("button", { name: "Edit" })).toBeDisabled();
    await expect(page.getByRole("status")).toContainText(/read-only/i);
  });

  test("records the work in the requirement's history", async ({ page }) => {
    await page.goto(requirementsUrl);
    await page.getByRole("link", { name: identifier }).click();

    await expect(page.getByText("Created")).toBeVisible();
    await expect(page.getByText("Status changed").first()).toBeVisible();
  });

  test("filters the list by status", async ({ page }) => {
    await page.goto(requirementsUrl);

    await page.getByLabel("Status").selectOption("APPROVED");
    await expect(page.getByRole("link", { name: identifier })).toBeVisible();

    await page.getByLabel("Status").selectOption("DRAFT");
    await expect(page.getByText("No requirements with this status")).toBeVisible();
  });
});
