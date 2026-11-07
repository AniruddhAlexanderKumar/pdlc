import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount, signOut, fillRecordNumber } from "./helpers";

/**
 * Design / operations drift, end to end:
 *
 *   sign in → project → design item, decision with an explicit-operator
 *   expectation (≤ 800 K)
 *   → baseline: add the design item and the expectation as members while
 *     DRAFT, activate it, watch membership controls disappear
 *   → observations tied to the design item and to the expectation, both
 *     within the expectation's bound → review both → evaluate: NO_DRIFT
 *   → rename the design item → evaluate again: DRIFT_DETECTED, DR-BAS-002
 *     names the design item
 *   → record and review an observation that violates the expectation →
 *     evaluate again: DR-EXP-001, inspect its basis
 *   → an unrelated requirement changes → the assessment for this baseline
 *     stays Current, because the drift fingerprint is scoped to what was
 *     actually compared, not to the project at large
 *   → open a historical (non-latest) assessment read-only
 *
 * Every step writes to PostgreSQL through the real API and the real engine.
 * Do not require every evaluation to reach NO_DRIFT: the point is the
 * engine's actual deterministic behaviour, including the divergences it
 * honestly reports rather than a clean run through.
 */

test.describe.serial("Design / operations drift", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Drift ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let designUrl: string;
  let baselineUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "drift");
      return;
    }
    await signIn(page, account);
  });

  test("builds a design item and a decision with an explicit-operator expectation", async ({
    page,
  }) => {
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

    // The expected consequence, with an explicit comparison operator so a
    // later observation can be compared against it mechanically.
    await page.getByRole("button", { name: "Set expectation" }).click();
    await page
      .getByLabel("Expectation")
      .fill("Chamber wall temperature stays at or below the material limit.");
    await page.getByLabel("Measure").fill("Peak wall temperature");
    await page.getByLabel("Expected value").fill("800");
    await page.getByLabel("Unit").fill("K");
    await page.getByLabel(/Comparison operator/).selectOption("LESS_THAN_OR_EQUAL");
    await page.getByRole("button", { name: "Save expectation" }).click();

    await expect(page.getByText("≤ 800 K")).toBeVisible();
  });

  test("assembles a baseline while draft, then activates it and loses its membership controls", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/baselines`);
    await page.getByRole("button", { name: "New baseline" }).first().click();
    await fillRecordNumber(page, "BL-001");
    await page.getByLabel("Name").fill("Preliminary design baseline");
    await page.getByRole("button", { name: "Create baseline" }).click();

    await expect(page).toHaveURL(/\/baselines\/[a-z0-9]+$/);
    baselineUrl = page.url();

    const members = page.getByRole("list", { name: "Baselined objects" });

    // The design item, while the baseline is still a draft. "Object" is
    // matched exactly — "Object type" would otherwise also satisfy it.
    await page.getByLabel("Object type").selectOption("DESIGN_ITEM");
    await page.getByLabel("Object", { exact: true }).selectOption({ index: 1 });
    await page.getByRole("button", { name: /add to baseline/i }).click();
    await expect(members).toContainText("DI-001");

    // The decision's expectation, named through its decision's identifier.
    await page.getByLabel("Object type").selectOption("DECISION_EXPECTATION");
    await page.getByLabel("Object", { exact: true }).selectOption({ index: 1 });
    await page.getByRole("button", { name: /add to baseline/i }).click();
    await expect(members).toContainText("Chamber wall temperature stays at or below");

    await page.getByRole("button", { name: "Activate" }).click();

    await expect(page.getByText(/This baseline is active and immutable/i)).toBeVisible();
    // Membership is fixed the moment it activates: nothing to add or remove.
    await expect(page.getByRole("button", { name: /add to baseline/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  });

  test("records observations for the design item and the expectation, and reviews them", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/observations`);

    // Tied to the design item. A plain configuration record — nothing here
    // compares a design item observation against anything by itself.
    await page.getByRole("button", { name: "Record observation" }).first().click();
    await fillRecordNumber(page, "OBS-001");
    await page.getByLabel("Title").fill("As-built inspection, combustion chamber");
    await page
      .getByLabel("Description")
      .fill("Visual and dimensional inspection against drawing D-114.");
    await page.getByLabel("Observation type").selectOption("INSPECTION");
    await page.getByLabel("Concerns").selectOption("DESIGN_ITEM");
    await page.getByLabel("Object").selectOption({ index: 1 });
    await page.getByRole("dialog").getByRole("button", { name: "Record observation" }).click();
    await expect(page.getByText("OBS-001")).toBeVisible();

    // Tied to the expectation, well within its ≤ 800 K bound.
    await page.getByRole("button", { name: "Record observation" }).first().click();
    await fillRecordNumber(page, "OBS-002");
    await page.getByLabel("Title").fill("Peak chamber wall temperature, static fire 1");
    await page
      .getByLabel("Description")
      .fill("Wall temperature recorded during the first static fire.");
    await page.getByLabel("Concerns").selectOption("DECISION_EXPECTATION");
    await page.getByLabel("Object").selectOption({ index: 1 });
    await page.getByLabel("Measured value").fill("780");
    await page.getByLabel("Unit").fill("K");
    await page.getByRole("dialog").getByRole("button", { name: "Record observation" }).click();
    await expect(page.getByText("OBS-002")).toBeVisible();

    await page.getByRole("row", { name: /OBS-001/ }).getByRole("button", { name: "Review" }).click();
    await expect(page.getByRole("row", { name: /OBS-001/ })).toContainText("Reviewed");

    await page.getByRole("row", { name: /OBS-002/ }).getByRole("button", { name: "Review" }).click();
    await expect(page.getByRole("row", { name: /OBS-002/ })).toContainText("Reviewed");
  });

  test("evaluates drift and finds nothing that requires review", async ({ page }) => {
    await page.goto(`${projectUrl}/drift`);

    // The toolbar's own evaluate button and the empty-state's are both named
    // "Evaluate drift" before anything has been evaluated; either does it.
    await page.getByRole("button", { name: "Evaluate drift" }).first().click();

    const verdict = page.getByRole("group", { name: "Drift verdict" });
    await expect(verdict).toContainText("No drift");
    await expect(page.getByRole("row", { name: /Review required/ })).toHaveCount(0);
  });

  test("goes stale when the design item's engineering state changes, and reports DR-BAS-002", async ({
    page,
  }) => {
    await page.goto(designUrl);
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel(/^Name/).fill("Combustion chamber (rev B)");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: /rev B/ })).toBeVisible();

    await page.goto(`${projectUrl}/drift`);
    // Reading never re-evaluates: the previous NO_DRIFT assessment is shown,
    // reported as stale rather than silently refreshed.
    await expect(page.getByText(/This drift assessment is stale/i)).toBeVisible();

    await page.getByRole("button", { name: /evaluate again/i }).click();

    const verdict = page.getByRole("group", { name: "Drift verdict" });
    await expect(verdict).toContainText("Drift detected");
    // Not a failure — the verdict text says so, not just a badge colour.
    await expect(verdict).toContainText(/not a finding that anything failed/i);

    const row = page.getByRole("row", { name: /DR-BAS-002/ });
    await expect(row).toContainText("Baseline changed");
    await expect(row).toContainText("Review required");
    await expect(row).toContainText("DI-001");
  });

  test("shows the formal configuration comparison on the baseline itself — no drift evaluation required", async ({
    page,
  }) => {
    await page.goto(baselineUrl);

    const comparison = page.getByText("Configuration comparison").locator("../..");
    await expect(comparison.getByText("Changed", { exact: true })).toBeVisible();
    await expect(comparison.getByText("Changed members (1)")).toBeVisible();
    await expect(comparison.getByText(/Combustion chamber \(rev B\)/)).toBeVisible();
  });

  test("records each evaluation as its own immutable assessment, with no score anywhere", async ({
    page,
  }) => {
    const apiPath = `${projectUrl.replace(/^https?:\/\/[^/]+/, "")}`.replace(
      "/projects/",
      "/api/projects/",
    );

    const response = await page.request.get(`${apiPath}/drift`);
    expect(response.ok()).toBe(true);

    const { assessments } = await response.json();
    // The NO_DRIFT run and the DRIFT_DETECTED run are both kept; neither
    // replaced the other.
    expect(assessments.length).toBeGreaterThanOrEqual(2);
    expect(assessments[0].driftVersion).toBe("1");
    expect(new Set(assessments.map((a: { id: string }) => a.id)).size).toBe(assessments.length);

    expect(JSON.stringify(assessments)).not.toMatch(/score|percent|confidence|probability/i);
  });

  test("records an observation that violates the expectation, and inspects the DR-EXP-001 basis", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/observations`);

    await page.getByRole("button", { name: "Record observation" }).first().click();
    await fillRecordNumber(page, "OBS-003");
    await page.getByLabel("Title").fill("Peak chamber wall temperature, static fire 2");
    await page
      .getByLabel("Description")
      .fill("Wall temperature recorded well above the design limit.");
    await page.getByLabel("Concerns").selectOption("DECISION_EXPECTATION");
    await page.getByLabel("Object").selectOption({ index: 1 });
    await page.getByLabel("Measured value").fill("950");
    await page.getByLabel("Unit").fill("K");
    await page.getByRole("dialog").getByRole("button", { name: "Record observation" }).click();
    await expect(page.getByText("OBS-003")).toBeVisible();

    await page.getByRole("row", { name: /OBS-003/ }).getByRole("button", { name: "Review" }).click();
    await expect(page.getByRole("row", { name: /OBS-003/ })).toContainText("Reviewed");

    await page.goto(`${projectUrl}/drift`);
    await expect(page.getByText(/This drift assessment is stale/i)).toBeVisible();
    await page.getByRole("button", { name: /evaluate again/i }).click();

    const row = page.getByRole("row", { name: /DR-EXP-001/ });
    await expect(row).toContainText("Expectation breach");
    await expect(row).toContainText("Review required");
    // Both values a reader could check by hand, printed beside the finding.
    await expect(row).toContainText("≤ 800 K");
    await expect(row).toContainText("950 K");

    await row.getByRole("button", { name: /inspect basis/i }).click();
    // The panel this reveals — scoped to the sibling row it opens, since the
    // same rule-basis words also appear inside other findings' explanations.
    const expandedBasis = row.locator("xpath=following-sibling::tr[1]");
    await expect(expandedBasis).toContainText(/expectation record/i);
    await expect(expandedBasis).toContainText(/observation value/i);
  });

  test("stays current when an unrelated object changes, since the fingerprint is scoped", async ({
    page,
  }) => {
    // Neither a baseline member nor an observation subject: this must not be
    // able to move the drift fingerprint for BL-001.
    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await fillRecordNumber(page, "REQ-500");
    await page.getByLabel("Short name").fill("Ground support telemetry rate");
    await page
      .getByLabel("What must it do?")
      .fill("Ground support equipment shall sample telemetry at 10 Hz.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);

    await page.goto(`${projectUrl}/drift`);
    await expect(page.getByText(/This drift assessment is stale/i)).toHaveCount(0);
    // Exact: several findings' own explanations use the word "current" in
    // prose, which a substring match would also pick up.
    await expect(page.getByText("Current", { exact: true })).toBeVisible();
  });

  test("keeps drift assessment history, and opens a historical one read-only", async ({ page }) => {
    await page.goto(`${projectUrl}/drift`);

    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    const openButtons = page.getByRole("button", { name: "Open" });
    expect(await openButtons.count()).toBeGreaterThanOrEqual(3);

    // The oldest assessment — recorded before the design item had changed.
    await openButtons.last().click();

    await expect(page.getByText(/Viewing a historical assessment/i)).toBeVisible();
    await expect(page.getByText(/cannot be edited/i)).toBeVisible();
    await expect(page.getByRole("group", { name: "Drift verdict" })).toContainText("No drift");
  });

  test("activates a later baseline, and the earlier one's frozen snapshot is untouched by it", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/baselines`);
    await page.getByRole("button", { name: "New baseline" }).first().click();
    await fillRecordNumber(page, "BL-002");
    await page.getByLabel("Name").fill("Revised design baseline");
    await page.getByRole("button", { name: "Create baseline" }).click();
    await expect(page).toHaveURL(/\/baselines\/[a-z0-9]+$/);

    await page.getByLabel("Object type").selectOption("DESIGN_ITEM");
    await page.getByLabel("Object", { exact: true }).selectOption({ index: 1 });
    await page.getByRole("button", { name: /add to baseline/i }).click();
    await expect(page.getByText(/DI-001/)).toBeVisible();

    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText(/This baseline is active and immutable/i)).toBeVisible();

    // The earlier baseline is now superseded, and its own snapshot — captured
    // before the design item was ever renamed — still reads exactly as it did
    // then, not as the design item reads today.
    await page.goto(baselineUrl);
    await expect(page.getByText(/This baseline is superseded and immutable/i)).toBeVisible();
    const members = page.getByRole("list", { name: "Baselined objects" });
    await expect(members).toContainText("Combustion chamber");
    await expect(members).not.toContainText("rev B");
  });

  test("keeps baselines project-isolated for another organization", async ({ page }) => {
    const baselineId = new URL(baselineUrl).pathname.split("/").pop();
    const projectId = new URL(projectUrl).pathname.split("/").pop();
    const apiBase = new URL(baselineUrl).origin;

    await signOut(page);
    await signUpNewAccount(page, "drift-other");

    const response = await page.request.get(
      `${apiBase}/api/projects/${projectId}/baselines/${baselineId}`,
    );
    expect(response.status()).toBe(404);

    await page.goto(baselineUrl);
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
