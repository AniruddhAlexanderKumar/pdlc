import { expect, test } from "@playwright/test";
import { databaseAvailable, signUpNewAccount } from "./helpers";

/**
 * Project module browser flows.
 *
 * Every flow here now requires a real authenticated session, and creating,
 * editing and archiving all write to PostgreSQL through the real API — there
 * is no client-side persistence to fall back on. The whole file is therefore
 * skipped, by name, when no database is reachable rather than being faked
 * into passing.
 *
 * Each run registers its own "[E2E]" organization, so tests never touch the
 * "[DEV]" seed record or each other's data.
 */

test.describe.serial("Project lifecycle", () => {
  const projectName = `[E2E] Project ${Date.now()}`;
  const updatedDescription = "Updated by the end-to-end lifecycle test.";
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    // Serial tests share a browser context, but each still needs a session;
    // the first registers the organization and the rest sign back into it.
    if (!account) {
      account = await signUpNewAccount(page, "projects");
      return;
    }

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard$/);
  });

  test("shows a genuine empty state for a new organization", async ({ page }) => {
    await page.goto("/projects");

    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(page.getByText("No projects yet")).toBeVisible();
  });

  test("creates a project", async ({ page }) => {
    await page.goto("/projects");

    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByLabel("Description").fill("Created by the end-to-end lifecycle test.");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("link", { name: projectName })).toBeVisible();
  });

  test("opens the created project", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("link", { name: projectName }).click();

    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();

    projectUrl = page.url();
  });

  test("edits the project", async ({ page }) => {
    await page.goto(projectUrl);

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Description").fill(updatedDescription);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(updatedDescription)).toBeVisible();

    // The change is persisted, not just held in component state.
    await page.reload();
    await expect(page.getByText(updatedDescription)).toBeVisible();
  });

  test("archives the project and makes it read-only", async ({ page }) => {
    await page.goto(projectUrl);

    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("cannot be undone");
    await page.getByRole("button", { name: "Archive project" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("status")).toContainText("archived and read-only");
    await expect(page.getByRole("button", { name: "Edit" })).toBeDisabled();

    // Archived projects remain listed, with their status visible.
    await page.goto("/projects");
    const row = page.getByRole("row").filter({ hasText: projectName });
    await expect(row).toContainText("Archived");
  });
});
