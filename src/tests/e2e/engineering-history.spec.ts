import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount, signOut, fillRecordNumber } from "./helpers";

/**
 * Engineering History, end to end:
 *
 *   sign in → project → a requirement and a risk, each transitioned through
 *   a real lifecycle change → open project Engineering History → confirm
 *   both real events appear, newest first → filter by module → open the
 *   requirement's own object history → follow it back to the requirement →
 *   follow it into Traceability → confirm project isolation through both
 *   the real API and the real UI's error state.
 *
 * Every event this spec asserts on was actually recorded by a real
 * lifecycle transition through the real UI — nothing here is seeded data.
 */

test.describe.serial("Engineering History", () => {
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let requirementUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "history");
      return;
    }
    await signIn(page, account);
  });

  test("builds a requirement and a risk, and transitions each through a real lifecycle change", async ({
    page,
  }) => {
    const projectName = `[E2E] History ${Date.now()}`;
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: projectName }).click();
    await page.waitForURL(/\/projects\/[a-z0-9]+$/);
    projectUrl = page.url();

    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await fillRecordNumber(page, "REQ-001");
    await page.getByLabel(/^Title/).fill("Maximum chamber pressure");
    await page.getByLabel(/^Statement/).fill("The engine shall not exceed 120 bar.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);
    requirementUrl = page.url();

    await page.getByRole("button", { name: "Move to in review" }).click();
    await expect(page.getByText("In review")).toBeVisible();

    await page.goto(`${projectUrl}/risks`);
    await page.getByRole("button", { name: "New risk" }).first().click();
    await fillRecordNumber(page, "RSK-001");
    await page.getByLabel(/^Title/).fill("Coolant supply interruption");
    await page.getByLabel(/^Description/).fill("The coolant loop may lose flow under vibration.");
    await page.getByRole("button", { name: "Create risk" }).click();
    await expect(page).toHaveURL(/\/risks\/[a-z0-9]+$/);

    await page.getByRole("button", { name: "Mark mitigated" }).click();
    await expect(page.getByText("Mitigated")).toBeVisible();
  });

  test("shows both real events in the project's Engineering History, newest first", async ({ page }) => {
    await page.goto(`${projectUrl}/history`);
    await expect(page.getByRole("heading", { name: "Engineering History" })).toBeVisible();

    const timeline = page.getByRole("list").first();
    await expect(timeline.getByText("Coolant supply interruption", { exact: false })).toBeVisible();
    await expect(timeline.getByText("Maximum chamber pressure", { exact: false })).toBeVisible();

    // The risk was transitioned after the requirement — its event is newer,
    // so it appears first in the newest-first list.
    const items = timeline.getByRole("listitem");
    const firstItemText = await items.first().innerText();
    expect(firstItemText).toContain("Coolant supply interruption");
  });

  test("filters the timeline by module", async ({ page }) => {
    await page.goto(`${projectUrl}/history`);
    await expect(page.getByText("Coolant supply interruption", { exact: false })).toBeVisible();

    await page.getByLabel("Module").selectOption("RISK");

    await expect(page.getByText("Maximum chamber pressure", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Coolant supply interruption", { exact: false })).toBeVisible();
  });

  test("opens the requirement's own object history, and follows it back to the requirement", async ({
    page,
  }) => {
    await page.goto(requirementUrl);
    await page.getByRole("link", { name: "History" }).click();

    await expect(page).toHaveURL(/\/history\/REQUIREMENT\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: /REQ-001/ })).toBeVisible();
    await expect(page.getByText("Status changed")).toBeVisible();

    await page.getByRole("link", { name: /open source object/i }).click();
    await expect(page).toHaveURL(requirementUrl);
  });

  test("offers navigation into Traceability from an object's history page", async ({ page }) => {
    const requirementId = new URL(requirementUrl).pathname.split("/").pop();
    await page.goto(`${projectUrl}/history/REQUIREMENT/${requirementId}`);

    await page.getByRole("link", { name: /open traceability/i }).click();
    await expect(page).toHaveURL(new RegExp(`${projectUrl}/traceability$`));
  });

  test("keeps Engineering History project-isolated for another organization", async ({ page }) => {
    const projectId = new URL(projectUrl).pathname.split("/").pop();
    const apiBase = new URL(projectUrl).origin;

    await signOut(page);
    await signUpNewAccount(page, "history-other");

    const response = await page.request.get(`${apiBase}/api/projects/${projectId}/history`);
    expect(response.status()).toBe(404);

    await page.goto(`${apiBase}/projects/${projectId}/history`);
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
