import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount, fillRecordNumber } from "./helpers";

/**
 * Requirement → verification → readiness, end to end:
 *
 *   build a traced slice (requirement → design → verification, plus a decision)
 *   → evaluate readiness while the requirement is still DRAFT and see it blocked
 *   → approve the requirement → re-evaluate and see it become ready
 *   → change a prerequisite design item → verify the assessment goes stale
 *   → evaluate again → open the earlier assessment and see it unchanged
 *
 * Every step writes to PostgreSQL through the real API and the real engine.
 * Nothing here evaluates readiness in the background; the spec asserts that
 * loading a stale assessment leaves it stale.
 */

test.describe.serial("Verification readiness", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Readiness ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let activityUrl: string;
  let requirementUrl: string;
  let designUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "readiness");
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

    // Trace it: requirement → design item, and requirement → verification.
    for (const relation of ["DESIGN_ITEM", "VERIFICATION_ACTIVITY"]) {
      await page.getByLabel("Relationship").selectOption(relation);
      await page.getByLabel("Artifact").selectOption({ index: 1 });
      await page.getByRole("button", { name: /add link/i }).click();
    }

    await expect(page.getByText(/DI-001/)).toBeVisible();
    await expect(page.getByText(/VA-001/)).toBeVisible();
  });

  test("shows the linked verification activity on the requirement", async ({ page }) => {
    await page.goto(requirementUrl);

    const verifiedBy = page.getByRole("heading", { name: "How it's checked" });
    await expect(verifiedBy).toBeVisible();
    // No fabricated readiness summary here — just the real link.
    await expect(page.getByText(/Open one to record its result/i)).toBeVisible();
  });

  test("shows no assessment until one is explicitly evaluated", async ({ page }) => {
    await page.goto(activityUrl);

    await expect(page.getByRole("heading", { name: "Verification readiness" })).toBeVisible();
    await expect(
      page.getByText(/No verification-readiness assessment has been run/i),
    ).toBeVisible();
    // No zero counts pretending an assessment exists.
    await expect(page.getByLabel("Readiness finding counts")).toHaveCount(0);
  });

  test("blocks readiness while the requirement is still a draft", async ({ page }) => {
    await page.goto(activityUrl);

    await page.getByRole("button", { name: /evaluate readiness/i }).click();

    const verdict = page.getByRole("group", { name: "Readiness verdict" });
    await expect(verdict).toContainText("Not ready");
    await expect(verdict).toContainText("Ready to execute?");

    // The exact condition, the object it concerns and the way out of it.
    const row = page.getByRole("row", { name: /VR-REQ-001/ });
    await expect(row).toContainText("Blocking");
    await expect(row).toContainText("Requirement state");
    await expect(row).toContainText("REQ-001 is DRAFT");
    await expect(row).toContainText(/APPROVED or BASELINED/);
  });

  test("does not treat missing evidence as a failure", async ({ page }) => {
    await page.goto(activityUrl);

    const row = page.getByRole("row", { name: /VR-EVD-002/ });
    await expect(row).toContainText("Information");
    await expect(row).toContainText(/not a readiness deficiency/i);
  });

  test("keeps readiness and result visibly separate", async ({ page }) => {
    await page.goto(activityUrl);

    await expect(page.getByRole("heading", { name: "Lifecycle and result" })).toBeVisible();
    const distinction = page.getByLabel("Readiness compared with verification result");
    await expect(distinction).toContainText("Verification readiness");
    await expect(distinction).toContainText("Verification result");

    // The activity itself is still PLANNED — readiness has not touched it.
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  });

  test("becomes ready once the requirement is approved", async ({ page }) => {
    await page.goto(requirementUrl);
    await page.getByRole("button", { name: "Move to in review" }).click();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved")).toBeVisible();

    await page.goto(activityUrl);
    // The previous assessment is stale, and says so rather than refreshing.
    await expect(page.getByText(/Readiness assessment is stale/i)).toBeVisible();

    await page.getByRole("button", { name: /evaluate again/i }).click();

    const verdict = page.getByRole("group", { name: "Readiness verdict" });
    await expect(verdict).toContainText("Ready");
    // Ready is not passed, and the page says so.
    await expect(verdict).toContainText(/not that it has passed/i);

    const row = page.getByRole("row", { name: /VR-REQ-003/ });
    await expect(row).toContainText("REQ-001 is APPROVED");
  });

  test("shows the engineering basis it actually walked", async ({ page }) => {
    await page.goto(activityUrl);

    await page.getByRole("button", { name: /inspect basis/i }).click();

    await expect(page.getByText("Requirement verified")).toBeVisible();
    await expect(page.getByText("Prerequisite design item")).toBeVisible();
    // The real edges, not an illustration.
    await expect(page.getByText("REQUIREMENT_VERIFIED_BY")).toBeVisible();
    await expect(page.getByText(/REQUIREMENT_ALLOCATED_TO_DESIGN/)).toBeVisible();
  });

  test("goes stale when a prerequisite object changes", async ({ page }) => {
    await page.goto(designUrl);
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel(/^Name/).fill("Combustion chamber (revised)");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: /revised/ })).toBeVisible();

    await page.goto(activityUrl);

    await expect(page.getByText(/Readiness assessment is stale/i)).toBeVisible();
    await expect(
      page.getByText(/engineering basis changed after this assessment was created/i),
    ).toBeVisible();
    // The stored verdict is still shown, not hidden or silently refreshed.
    await expect(page.getByRole("group", { name: "Readiness verdict" })).toContainText("Ready");
  });

  test("does not re-evaluate on its own — a new assessment is explicit", async ({ page }) => {
    await page.goto(activityUrl);

    await expect(page.getByText(/Readiness assessment is stale/i)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Readiness assessment is stale/i)).toBeVisible();

    await page.getByRole("button", { name: /evaluate again/i }).click();

    await expect(page.getByText(/Readiness assessment is stale/i)).toHaveCount(0);
    await expect(page.getByText("Current")).toBeVisible();
  });

  test("keeps prior assessments, and opens one read-only", async ({ page }) => {
    await page.goto(activityUrl);

    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    const openButtons = page.getByRole("button", { name: /^Open/ });
    expect(await openButtons.count()).toBeGreaterThanOrEqual(2);

    // The very first assessment, taken while the requirement was a draft.
    await openButtons.last().click();

    await expect(page.getByText(/Viewing a historical assessment/i)).toBeVisible();
    await expect(page.getByText(/cannot be edited/i)).toBeVisible();
    // It still says what was believed then.
    await expect(page.getByRole("group", { name: "Readiness verdict" })).toContainText(
      "Not ready",
    );
    await expect(page.getByRole("row", { name: /VR-REQ-001/ })).toBeVisible();
  });

  test("records every evaluation as its own immutable assessment", async ({ page }) => {
    const apiPath = `${activityUrl.replace(/^https?:\/\/[^/]+/, "")}`
      .replace("/projects/", "/api/projects/")
      .replace("/verification/", "/verification-activities/");

    const response = await page.request.get(`${apiPath}/readiness`);
    expect(response.ok()).toBe(true);

    const { assessments } = await response.json();
    // Each explicit evaluation created its own record; none replaced another.
    expect(assessments.length).toBeGreaterThanOrEqual(3);
    expect(assessments[0].readinessVersion).toBe("1");
    expect(new Set(assessments.map((a: { id: string }) => a.id)).size).toBe(assessments.length);

    // And no score, percentage or confidence anywhere in the payload.
    expect(JSON.stringify(assessments)).not.toMatch(/score|percent|confidence|probability/i);
  });

  test("surfaces the last recorded assessment on the verification list", async ({ page }) => {
    await page.goto(`${projectUrl}/verification`);

    const row = page.getByRole("row", { name: /VA-001/ });
    await expect(row).toContainText("Ready");
    // The list is explicit that this is what was recorded, not a current claim.
    await expect(page.getByText(/as it was recorded/i)).toBeVisible();
  });
});
