import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount, signOut, fillRecordNumber } from "./helpers";

/**
 * Evidence, end to end:
 *
 *   sign in → project → create a requirement → record evidence → inspect it
 *   → link it to the requirement → inspect traceability → validate it →
 *   supersede it with a second, real evidence record → confirm the original
 *   remains visible and read-only → confirm the requirement's traceability
 *   still names the *original* evidence, not the replacement → verify
 *   project isolation through the real API.
 *
 * Every object here is created through the real UI and the real API; this
 * spec never asserts a file was uploaded, because the interface never offers
 * an upload — evidence here is a record and a reference.
 */

test.describe.serial("Evidence", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Evidence ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let requirementUrl: string;
  let evidenceUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "evidence");
      return;
    }
    await signIn(page, account);
  });

  test("builds a requirement, then records a piece of evidence", async ({ page }) => {
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
    await page.getByLabel("Short name").fill("Maximum chamber pressure");
    await page.getByLabel("What must it do?").fill("The engine shall not exceed 120 bar.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);
    requirementUrl = page.url();

    await page.goto(`${projectUrl}/evidence`);
    await page.getByRole("button", { name: "Record evidence" }).first().click();
    await fillRecordNumber(page, "EV-001");
    await page.getByLabel(/^Title/).fill("Hot fire test report");
    await page.getByLabel(/Source reference/).fill("TR-2026-014");
    await page.getByRole("button", { name: /^record evidence$/i }).click();
    await expect(page).toHaveURL(/\/evidence\/[a-z0-9]+$/);
    evidenceUrl = page.url();

    await expect(page.getByRole("heading", { name: /EV-001/ })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    await expect(page.getByText("Not yet validated")).toBeVisible();
  });

  test("links the evidence to the requirement and shows it in traceability", async ({ page }) => {
    await page.goto(evidenceUrl);
    await page.getByLabel("Relationship").selectOption("REQUIREMENT");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/REQ-001/)).toBeVisible();

    // The real graph resolves it too — no graph visualization UI exists, so
    // this checks the real API directly, the same way the risks/issues and
    // traceability specs already do.
    const evidenceId = new URL(evidenceUrl).pathname.split("/").pop();
    const projectId = new URL(projectUrl).pathname.split("/").pop();
    const response = await page.request.get(
      `${new URL(evidenceUrl).origin}/api/projects/${projectId}/graph/node/EVIDENCE/${evidenceId}/neighbors?direction=INBOUND`,
    );
    expect(response.ok()).toBe(true);
    const { connections } = await response.json();
    expect(connections.some((c: { neighbor: { type: string } }) => c.neighbor.type === "REQUIREMENT")).toBe(
      true,
    );
  });

  test("validates the evidence, freezing its content", async ({ page }) => {
    await page.goto(evidenceUrl);
    await page.getByRole("button", { name: "Validate" }).click();

    await expect(page.getByText("Validated", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /edit/i })).toBeDisabled();
  });

  test("supersedes the evidence with a second, real record", async ({ page }) => {
    await page.goto(`${projectUrl}/evidence`);
    await page.getByRole("button", { name: "Record evidence" }).first().click();
    await fillRecordNumber(page, "EV-002");
    await page.getByLabel(/^Title/).fill("Corrected hot fire test report");
    await page.getByLabel(/Source reference/).fill("TR-2026-014-REV-A");
    await page.getByRole("button", { name: /^record evidence$/i }).click();
    await expect(page).toHaveURL(/\/evidence\/[a-z0-9]+$/);

    await page.goto(evidenceUrl);
    await page.getByRole("button", { name: "Supersede…" }).click();
    await page.getByLabel(/replacement evidence/i).selectOption({ index: 1 });
    await page.getByRole("button", { name: "Supersede" }).click();

    await expect(page.getByText("Superseded", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /EV-002/ })).toBeVisible();
    await expect(page.getByText("No further transitions are possible.")).toBeVisible();
  });

  test("keeps the superseded evidence visible, and the requirement's link still names the original version", async ({
    page,
  }) => {
    // Historical visibility: the superseded record is still a real page, not
    // deleted.
    await page.goto(evidenceUrl);
    await expect(page.getByRole("heading", { name: /EV-001/ })).toBeVisible();
    await expect(page.getByText("Superseded", { exact: true }).first()).toBeVisible();

    // The requirement's own traceability panel still names EV-001 — nothing
    // silently moved the historical link onto EV-002.
    await page.goto(requirementUrl);
    await expect(page.getByText(/EV-001/)).toBeVisible();
    await expect(page.getByText(/EV-002/)).toHaveCount(0);
  });

  test("keeps evidence project-isolated for another organization", async ({ page }) => {
    const evidenceId = new URL(evidenceUrl).pathname.split("/").pop();
    const projectId = new URL(projectUrl).pathname.split("/").pop();
    const apiBase = new URL(evidenceUrl).origin;

    await signOut(page);
    await signUpNewAccount(page, "evidence-other");

    const response = await page.request.get(
      `${apiBase}/api/projects/${projectId}/evidence/${evidenceId}`,
    );
    expect(response.status()).toBe(404);

    await page.goto(evidenceUrl);
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
