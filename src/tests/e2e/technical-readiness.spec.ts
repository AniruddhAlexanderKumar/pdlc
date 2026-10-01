import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount, fillRecordNumber } from "./helpers";

/**
 * Project → gates, end to end:
 *
 *   build a traced slice (need → requirement → design → verification, plus a
 *   decision with an assumption)
 *   → evaluate SYSTEM_DEFINITION while the requirement is a draft and see it
 *     blocked, with the exact condition named
 *   → approve the requirement → re-evaluate and watch the blocker clear
 *   → evaluate DESIGN_REVIEW → change a scope object → verify stale
 *   → re-evaluate → evaluate VERIFICATION_READY and inspect the consumed
 *     verification-readiness verdict → evaluate RELEASE_READY
 *   → open a historical assessment read-only
 *
 * Every step writes to PostgreSQL through the real API and the real engine.
 * No gate is required to come back READY: the spec asserts the engine's actual
 * deterministic behaviour, including where it honestly refuses to conclude.
 */

test.describe.serial("Technical readiness", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Gates ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let requirementUrl: string;
  let designUrl: string;
  let activityUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "gates");
      return;
    }
    await signIn(page, account);
  });

  test("builds a traced slice of a programme", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: projectName }).click();
    await page.waitForURL(/\/projects\/[a-z0-9]+$/);
    projectUrl = page.url();

    await page.goto(`${projectUrl}/stakeholder-needs`);
    await page.getByRole("button", { name: "New stakeholder need" }).first().click();
    await fillRecordNumber(page, "SN-001");
    await page.getByLabel(/^Title/).fill("Survive ascent loads");
    await page.getByLabel(/^Description/).fill("The vehicle must survive max q.");
    await page.getByLabel(/^Stakeholder/).fill("Chief Engineer");
    await page.getByRole("button", { name: "Create stakeholder need" }).click();
    await expect(page).toHaveURL(/\/stakeholder-needs\/[a-z0-9]+$/);

    await page.goto(`${projectUrl}/design-items`);
    await page.getByRole("button", { name: "New design item" }).first().click();
    await fillRecordNumber(page, "DI-001");
    await page.getByLabel(/^Name/).fill("Combustion chamber");
    await page.getByRole("button", { name: "Create design item" }).click();
    await expect(page).toHaveURL(/\/design-items\/[a-z0-9]+$/);
    designUrl = page.url();

    await page.goto(`${projectUrl}/decisions`);
    await page.getByRole("button", { name: "New decision" }).first().click();
    await fillRecordNumber(page, "ED-001");
    await page.getByLabel(/^Title/).fill("Use regenerative cooling");
    await page.getByLabel(/^Statement/).fill("The chamber will be regeneratively cooled.");
    await page.getByLabel(/^Rationale/).fill("Ablative liner mass was prohibitive.");
    await page.getByRole("button", { name: "Create decision" }).click();
    await expect(page).toHaveURL(/\/decisions\/[a-z0-9]+$/);

    await page.goto(`${projectUrl}/verification`);
    await page.getByRole("button", { name: "New check" }).first().click();
    await fillRecordNumber(page, "VA-001");
    await page.getByLabel(/^Title/).fill("Proof pressure test");
    await page.getByRole("button", { name: "Create check" }).click();
    await expect(page).toHaveURL(/\/verification\/[a-z0-9]+$/);
    activityUrl = page.url();

    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await fillRecordNumber(page, "REQ-001");
    await page.getByLabel(/^Title/).fill("Maximum chamber pressure");
    await page.getByLabel(/^Statement/).fill("The engine shall not exceed 120 bar.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);
    requirementUrl = page.url();

    // Trace it in every direction the gates read.
    for (const relation of ["STAKEHOLDER_NEED", "DESIGN_ITEM", "VERIFICATION_ACTIVITY"]) {
      await page.getByLabel("Relationship").selectOption(relation);
      await page.getByLabel("Artifact").selectOption({ index: 1 });
      await page.getByRole("button", { name: /add link/i }).click();
    }

    await expect(page.getByText(/DI-001/)).toBeVisible();
    await expect(page.getByText(/VA-001/)).toBeVisible();
  });

  test("shows no gate assessment until one is explicitly evaluated", async ({ page }) => {
    await page.goto(projectUrl);

    await expect(page.getByRole("heading", { name: "Technical readiness" })).toBeVisible();
    await expect(page.getByLabel("Gate")).toHaveValue("SYSTEM_DEFINITION");
    await expect(
      page.getByText(/The system definition gate has not been assessed/i),
    ).toBeVisible();
    // No zero counts pretending an assessment exists.
    await expect(page.getByLabel("Gate finding counts")).toHaveCount(0);
  });

  test("blocks system definition while the requirement is a draft", async ({ page }) => {
    await page.goto(projectUrl);

    await page.getByRole("button", { name: /evaluate gate/i }).click();

    const verdict = page.getByRole("group", { name: "Gate verdict" });
    await expect(verdict).toContainText("Not ready");
    await expect(verdict).toContainText("System definition");

    // The exact condition, the object it concerns and why it matters.
    const row = page.getByRole("row", { name: /TR-REQ-002/ });
    await expect(row).toContainText("Blocking");
    await expect(row).toContainText("Requirement");
    await expect(row).toContainText("REQ-001 is DRAFT");
  });

  test("names what it evaluated rather than inventing a count", async ({ page }) => {
    await page.goto(projectUrl);

    await expect(page.getByText(/Current active engineering scope —/)).toBeVisible();
    const row = page.getByRole("row", { name: /TR-SCP-001/ });
    await expect(row).toContainText("1 requirement(s)");
  });

  test("clears the blocker once the requirement is approved", async ({ page }) => {
    await page.goto(requirementUrl);
    await page.getByRole("button", { name: "Move to in review" }).click();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved")).toBeVisible();

    await page.goto(projectUrl);
    // The previous assessment is stale, and says so rather than refreshing.
    await expect(page.getByText(/Gate assessment is stale/i)).toBeVisible();

    await page.getByRole("button", { name: /evaluate again/i }).click();

    await expect(page.getByRole("row", { name: /TR-REQ-002/ })).toHaveCount(0);
    await expect(page.getByText("Current")).toBeVisible();
  });

  test("evaluates design review as a different question", async ({ page }) => {
    await page.goto(projectUrl);
    await page.getByLabel("Gate").selectOption("DESIGN_REVIEW");

    // Selecting a gate must not answer it.
    await expect(page.getByText(/The design review gate has not been assessed/i)).toBeVisible();

    await page.getByRole("button", { name: /evaluate gate/i }).click();

    const verdict = page.getByRole("group", { name: "Gate verdict" });
    await expect(verdict).toContainText("Design review");
    // The draft design item is a warning here, not a blocker.
    await expect(page.getByRole("row", { name: /TR-DES-003/ })).toContainText("Warning");
  });

  test("goes stale when a scope object changes, and does not re-evaluate itself", async ({
    page,
  }) => {
    await page.goto(designUrl);
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel(/^Name/).fill("Combustion chamber (revised)");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: /revised/ })).toBeVisible();

    await page.goto(projectUrl);
    await page.getByLabel("Gate").selectOption("DESIGN_REVIEW");

    await expect(page.getByText(/Gate assessment is stale/i)).toBeVisible();
    await page.reload();
    await page.getByLabel("Gate").selectOption("DESIGN_REVIEW");
    await expect(page.getByText(/Gate assessment is stale/i)).toBeVisible();

    await page.getByRole("button", { name: /evaluate again/i }).click();
    await expect(page.getByText(/Gate assessment is stale/i)).toHaveCount(0);
  });

  test("blocks the verification gate on an unassessed activity", async ({ page }) => {
    await page.goto(projectUrl);
    await page.getByLabel("Gate").selectOption("VERIFICATION_READY");
    await page.getByRole("button", { name: /evaluate gate/i }).click();

    const row = page.getByRole("row", { name: /TR-VER-001/ });
    await expect(row).toContainText("Blocking");
    await expect(row).toContainText("never had its readiness assessed");
    await expect(page.getByRole("group", { name: "Gate verdict" })).toContainText("Not ready");
  });

  test("consumes a real verification-readiness verdict once one exists", async ({ page }) => {
    await page.goto(activityUrl);
    await page.getByRole("button", { name: /evaluate readiness/i }).click();
    await expect(page.getByRole("group", { name: "Readiness verdict" })).toBeVisible();

    await page.goto(projectUrl);
    await page.getByLabel("Gate").selectOption("VERIFICATION_READY");
    await page.getByRole("button", { name: /evaluate gate|evaluate again/i }).click();

    await page.getByRole("button", { name: /inspect scope/i }).click();
    await expect(page.getByText("Verification readiness consumed")).toBeVisible();
    await expect(page.getByRole("link", { name: "Verification activity" })).toBeVisible();

    // The gate cites the other engine's verdict rather than restating its rules.
    await expect(page.getByRole("row", { name: /VR-REQ/ })).toHaveCount(0);
  });

  test("evaluates the release gate strictly", async ({ page }) => {
    await page.goto(projectUrl);
    await page.getByLabel("Gate").selectOption("RELEASE_READY");
    await page.getByRole("button", { name: /evaluate gate/i }).click();

    const verdict = page.getByRole("group", { name: "Gate verdict" });
    await expect(verdict).toContainText("Release ready");
    await expect(verdict).toContainText("Not ready");

    // The requirement is approved but not baselined, and the verification has
    // not concluded. Both are named.
    await expect(page.getByRole("row", { name: /TR-REQ-005/ })).toContainText("Blocking");
    await expect(page.getByRole("row", { name: /TR-VER-006/ })).toContainText("Blocking");
    // And the release gate never claims to be certification.
    await expect(verdict).toContainText(/not certification/i);
  });

  test("keeps each gate's history, and opens one read-only", async ({ page }) => {
    await page.goto(projectUrl);
    await page.getByLabel("Gate").selectOption("SYSTEM_DEFINITION");

    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    const openButtons = page.getByRole("button", { name: /^Open/ });
    expect(await openButtons.count()).toBeGreaterThanOrEqual(2);

    // The very first assessment, taken while the requirement was a draft.
    await openButtons.last().click();

    await expect(page.getByText(/Viewing a historical assessment/i)).toBeVisible();
    await expect(page.getByText(/cannot be edited/i)).toBeVisible();
    await expect(page.getByRole("group", { name: "Gate verdict" })).toContainText("Not ready");
    await expect(page.getByRole("row", { name: /TR-REQ-002/ })).toBeVisible();
  });

  test("records every evaluation as its own immutable assessment", async ({ page }) => {
    const apiPath = `${projectUrl.replace(/^https?:\/\/[^/]+/, "")}`.replace(
      "/projects/",
      "/api/projects/",
    );

    const response = await page.request.get(`${apiPath}/technical-readiness`);
    expect(response.ok()).toBe(true);

    const { assessments } = await response.json();
    // Each explicit evaluation created its own record; none replaced another.
    expect(assessments.length).toBeGreaterThanOrEqual(5);
    expect(assessments[0].readinessVersion).toBe("1");
    expect(new Set(assessments.map((a: { id: string }) => a.id)).size).toBe(assessments.length);
    // More than one gate is represented.
    expect(new Set(assessments.map((a: { gate: string }) => a.gate)).size).toBeGreaterThan(1);

    // And no score, percentage or confidence anywhere in the payload.
    expect(JSON.stringify(assessments)).not.toMatch(/score|percent|confidence|probability/i);
  });
});
