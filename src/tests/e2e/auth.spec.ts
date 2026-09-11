import { expect, test } from "@playwright/test";
import { databaseAvailable, signUpNewAccount } from "./helpers";

/**
 * Full authentication round trip:
 *   sign up → dashboard → projects → sign out → sign in → dashboard
 *
 * Every step writes to or reads from PostgreSQL (users, credentials,
 * sessions), so the whole file is skipped when no database is reachable. None
 * of it is simulated.
 */

test.describe("Authentication lifecycle", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");
  });

  test("registers, works in the workspace, signs out and signs back in", async ({ page }) => {
    const account = await signUpNewAccount(page, "lifecycle");

    // Registration authenticated us in the same step.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(account.email)).toBeVisible();

    // The new organization starts genuinely empty — no seeded content.
    await page.getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByText("No projects yet")).toBeVisible();

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/sign-in/);

    // The session is dead server-side, not merely forgotten by the browser.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);

    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(account.email)).toBeVisible();
  });

  test("rejects a wrong password without revealing whether the account exists", async ({
    page,
  }) => {
    const account = await signUpNewAccount(page, "wrongpass");
    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/sign-in/);

    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill("definitely the wrong password");
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Incorrect email address or password.");
    await expect(page).toHaveURL(/\/sign-in/);

    // An unknown address produces the identical message.
    await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.test`);
    await page.getByLabel("Password").fill("definitely the wrong password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alert).toContainText("Incorrect email address or password.");
  });

  test("refuses to register the same email twice", async ({ page }) => {
    const account = await signUpNewAccount(page, "duplicate");
    await page.getByRole("button", { name: /sign out/i }).click();

    await page.goto("/sign-up");
    await page.getByLabel("Organization name").fill("[E2E] Duplicate Attempt");
    await page.getByLabel("Your name").fill("Someone Else");
    await page.getByLabel("Work email").fill(account.email);
    await page.getByLabel("Password").fill("another sufficiently long password");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("alert")).toContainText(/already exists/i);
  });

  test("keeps each organization's projects private", async ({ page }) => {
    // First organization creates a project.
    await signUpNewAccount(page, "tenant-a");
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    const projectName = `[E2E] Tenant A ${Date.now()}`;
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("link", { name: projectName })).toBeVisible();

    const projectUrl = await page
      .getByRole("link", { name: projectName })
      .getAttribute("href");

    await page.getByRole("button", { name: /sign out/i }).click();

    // A second organization must not see or reach it.
    await signUpNewAccount(page, "tenant-b");
    await page.goto("/projects");
    await expect(page.getByText("No projects yet")).toBeVisible();

    await page.goto(projectUrl!);
    // Reported as missing, never as forbidden — existence is not confirmed.
    await expect(page.getByRole("alert")).toContainText(/no longer exists/i);
  });
});
