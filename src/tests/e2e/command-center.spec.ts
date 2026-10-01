import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount, signOut } from "./helpers";

/**
 * The Engineering Command Center, end to end:
 *
 *   sign in → project → create a requirement, an open risk and a critical
 *   issue → open the Command Center → confirm real project information →
 *   confirm both show up as attention items with their real reason → follow
 *   one into its real source page → confirm a second, empty project shows
 *   an honest "nothing requires attention" state → confirm project
 *   isolation through both the real API and the real UI.
 *
 * Nothing in this spec asserts a score, a percentage, or a health value,
 * because the page never renders one.
 */

test.describe.serial("Engineering Command Center", () => {
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let riskUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "command-center");
      return;
    }
    await signIn(page, account);
  });

  test("builds a small populated project: a requirement, an open risk and a critical issue", async ({
    page,
  }) => {
    const projectName = `[E2E] Command Center ${Date.now()}`;
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

    await page.goto(`${projectUrl}/risks`);
    await page.getByRole("button", { name: "New risk" }).first().click();
    await page.getByLabel("Identifier").fill("RSK-001");
    await page.getByLabel(/^Title/).fill("Coolant supply interruption");
    await page.getByLabel(/^Description/).fill("The coolant loop may lose flow under vibration.");
    await page.getByRole("button", { name: "Create risk" }).click();
    await expect(page).toHaveURL(/\/risks\/[a-z0-9]+$/);
    riskUrl = page.url();

    await page.goto(`${projectUrl}/issues`);
    await page.getByRole("button", { name: "New issue" }).first().click();
    await page.getByLabel("Identifier").fill("ISS-001");
    await page.getByLabel(/^Title/).fill("Pressure sensor drift");
    await page.getByLabel(/^Description/).fill("Sensor readings drifted during hot-fire.");
    await page.getByLabel(/^Severity/).selectOption("CRITICAL");
    await page.getByRole("button", { name: "Create issue" }).click();
    await expect(page).toHaveURL(/\/issues\/[a-z0-9]+$/);
  });

  test("opens the Command Center and shows real project information and both attention items", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/command-center`);

    await expect(page.getByRole("heading", { name: "Engineering Command Center" })).toBeVisible();

    await expect(page.getByText("Risk RSK-001 is open")).toBeVisible();
    await expect(page.getByText(/Issue ISS-001 is CRITICAL/)).toBeVisible();

    // No fabricated numbers anywhere on the page.
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/\d+%/);
    expect(text.toLowerCase()).not.toMatch(/risk score|heatmap|health score/);
  });

  test("follows an attention item into its real source page", async ({ page }) => {
    await page.goto(`${projectUrl}/command-center`);

    const riskRow = page.getByText("Risk RSK-001 is open").locator("../..");
    await riskRow.getByRole("link", { name: "Open" }).click();

    await expect(page).toHaveURL(riskUrl);
    await expect(page.getByRole("heading", { name: /RSK-001/ })).toBeVisible();
  });

  test("shows an honest empty state for a project with nothing recorded", async ({ page }) => {
    const emptyProjectName = `[E2E] Command Center Empty ${Date.now()}`;
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(emptyProjectName);
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("link", { name: emptyProjectName }).click();
    await page.waitForURL(/\/projects\/[a-z0-9]+$/);
    const emptyProjectUrl = page.url();

    await page.goto(`${emptyProjectUrl}/command-center`);

    await expect(page.getByText("Nothing requires attention right now")).toBeVisible();
    await expect(page.getByText("No certification program exists yet for this project.")).toBeVisible();
  });

  test("keeps the Command Center project-isolated for another organization", async ({ page }) => {
    const projectId = new URL(projectUrl).pathname.split("/").pop();
    const apiBase = new URL(projectUrl).origin;

    await signOut(page);
    await signUpNewAccount(page, "command-center-other");

    const response = await page.request.get(`${apiBase}/api/projects/${projectId}/command-center`);
    expect(response.status()).toBe(404);

    await page.goto(`${apiBase}/projects/${projectId}/command-center`);
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
