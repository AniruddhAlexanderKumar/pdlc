import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount, fillRecordNumber } from "./helpers";

/**
 * Change → graph → computed impact, end to end:
 *
 *   build a traced slice (requirement → design → verification, plus a decision)
 *   → raise a change → declare a requirement impact → run the analysis
 *   → verify the direct and downstream findings → inspect provenance
 *   → edit a reached object → verify the analysis goes stale
 *   → run a new analysis → verify history is kept
 *
 * Every step writes to PostgreSQL through the real API and the real engine.
 * Nothing here re-runs an analysis in the background; the spec asserts that
 * reading a stale result leaves it stale.
 */

test.describe.serial("Change impact analysis", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Impact ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let changeUrl: string;
  let requirementUrl: string;
  let firstAnalysisDate: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "impact");
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

    await page.goto(`${projectUrl}/verification`);
    await page.getByRole("button", { name: "New check" }).first().click();
    await fillRecordNumber(page, "VA-001");
    await page.getByLabel(/^Title/).fill("Hot fire test");
    await page.getByRole("button", { name: "Create check" }).click();
    await expect(page).toHaveURL(/\/verification\/[a-z0-9]+$/);

    await page.goto(`${projectUrl}/decisions`);
    await page.getByRole("button", { name: "New decision" }).first().click();
    await fillRecordNumber(page, "ED-001");
    await page.getByLabel(/^Title/).fill("Use regenerative cooling");
    await page.getByLabel(/^Statement/).fill("The chamber will be regeneratively cooled.");
    await page.getByLabel(/^Rationale/).fill("Ablative liner mass was prohibitive.");
    await page.getByRole("button", { name: "Create decision" }).click();
    await expect(page).toHaveURL(/\/decisions\/[a-z0-9]+$/);

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

  test("raises a change and declares the requirement as impacted", async ({ page }) => {
    await page.goto(`${projectUrl}/changes`);
    await page.getByRole("button", { name: "New change" }).first().click();
    await fillRecordNumber(page, "CR-001");
    await page.getByLabel(/^Title/).fill("Raise the chamber pressure limit");
    await page.getByLabel(/^Description/).fill("Raise the limit from 120 to 130 bar.");
    await page.getByLabel(/^Reason/).fill("Performance shortfall found in hot fire.");
    await page.getByRole("button", { name: "Create change request" }).click();

    await expect(page).toHaveURL(/\/changes\/[a-z0-9]+$/);
    changeUrl = page.url();

    await page.getByLabel("Artifact type").selectOption("REQUIREMENT");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /declare impact/i }).click();

    await expect(page.getByText("REQ-001")).toBeVisible();
  });

  test("shows no analysis until one is explicitly run", async ({ page }) => {
    await page.goto(changeUrl);

    await expect(page.getByRole("heading", { name: "Computed impact" })).toBeVisible();
    await expect(page.getByText(/No impact analysis has been run/i)).toBeVisible();
    // No zero counts pretending an analysis exists.
    await expect(page.getByLabel("Impact summary")).toHaveCount(0);
  });

  test("runs an analysis that reaches the traced objects", async ({ page }) => {
    await page.goto(changeUrl);

    await page.getByRole("button", { name: /run impact analysis/i }).click();

    await expect(page.getByLabel("Impact summary")).toBeVisible();
    await expect(page.getByText("Current")).toBeVisible();

    // The declared requirement is DIRECT.
    const requirementRow = page.getByRole("row", { name: /REQ-001/ });
    await expect(requirementRow).toContainText("Direct");

    // The design item and verification activity are reached by propagation,
    // crossing out of the requirement domain.
    const designRow = page.getByRole("row", { name: /DI-001/ });
    await expect(designRow).toContainText("Cross-domain");
    await expect(designRow).toContainText("Potentially affected");

    const verificationRow = page.getByRole("row", { name: /VA-001/ });
    await expect(verificationRow).toContainText("Cross-domain");
    // Reached, not failed.
    await expect(verificationRow).not.toContainText("Failed");

    firstAnalysisDate = (await page.getByLabel("Impact summary").textContent()) ?? "";
    expect(firstAnalysisDate.length).toBeGreaterThan(0);
  });

  test("explains why an object was included", async ({ page }) => {
    await page.goto(changeUrl);

    const designRow = page.getByRole("row", { name: /DI-001/ });
    await designRow.getByRole("button").click();

    // The real edge that was walked, not a fabricated path.
    await expect(page.getByText("REQUIREMENT_ALLOCATED_TO_DESIGN")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Path" })).toBeVisible();
  });

  test("does not claim the verification failed", async ({ page }) => {
    await page.goto(changeUrl);

    const verificationRow = page.getByRole("row", { name: /VA-001/ });
    await verificationRow.getByRole("button").click();

    await expect(page.getByText("verification outcome not evaluated")).toBeVisible();
  });

  test("goes stale when a reached object changes", async ({ page }) => {
    await page.goto(requirementUrl);
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel(/^Statement/).fill("The engine shall not exceed 130 bar.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("The engine shall not exceed 130 bar.")).toBeVisible();

    await page.goto(changeUrl);

    await expect(page.getByText("Analysis is stale.")).toBeVisible();
    await expect(page.getByText(/engineering graph changed after this analysis/i)).toBeVisible();
    // Stale findings are still shown, not hidden or silently refreshed.
    await expect(page.getByRole("row", { name: /DI-001/ })).toBeVisible();
  });

  test("does not rerun on its own — a new run is explicit", async ({ page }) => {
    await page.goto(changeUrl);

    // Reloading a stale analysis leaves it stale.
    await expect(page.getByText("Analysis is stale.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Analysis is stale.")).toBeVisible();

    await page.getByRole("button", { name: /run new analysis/i }).click();

    await expect(page.getByText("Analysis is stale.")).toHaveCount(0);
    await expect(page.getByText("Current")).toBeVisible();
  });

  test("keeps the earlier analysis in history", async ({ page }) => {
    const response = await page.request.get(
      `${changeUrl.replace(/^https?:\/\/[^/]+/, "")}`.replace(
        "/projects/",
        "/api/projects/",
      ) + "/impact-analysis",
    );
    expect(response.ok()).toBe(true);

    const { analyses } = await response.json();
    // Each explicit run created its own immutable record; none replaced another.
    expect(analyses.length).toBeGreaterThanOrEqual(2);
    expect(analyses[0].engineVersion).toBe("1");
    expect(new Set(analyses.map((a: { id: string }) => a.id)).size).toBe(analyses.length);
  });
});
