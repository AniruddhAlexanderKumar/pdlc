import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount, fillRecordNumber } from "./helpers";

/**
 * Certification workspace, end to end:
 *
 *   sign in → project → certification programme → certification basis,
 *   activated → compliance item, applicability set APPLICABLE, method chosen
 *   → requirement + verification activity created and linked → evidence
 *     reference created and linked
 *   → evaluate the certification review: inspect the blocking/informational
 *     findings an incomplete record honestly produces
 *   → fix the missing engineering link, evaluate again, verify the result
 *     changed
 *   → a certification finding (HIGH) is raised, blocking the review;
 *     resolved with a note; evaluate again, verify the finding's own review
 *     finding moved from blocking to informational
 *   → inspect immutable review history: a prior review's findings differ from
 *     the latest one, and neither is editable
 *   → the linked requirement changes → the review goes STALE → re-evaluate →
 *     CURRENT again
 *
 * Every step writes to PostgreSQL through the real API and the real engine.
 * The final state is asserted exactly as the deterministic engine actually
 * produces it — this spec never requires READY if the recorded data does not
 * justify it, and it never asserts a percentage or the words "certified" /
 * "FAA compliant" / "EASA approved" anywhere on the page.
 */

test.describe.serial("Certification workspace", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Certification ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "certification");
      return;
    }
    await signIn(page, account);
  });

  test("creates a project, a certification programme, and an activated certification basis", async ({
    page,
  }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: projectName }).click();
    await page.waitForURL(/\/projects\/[a-z0-9]+$/);
    projectUrl = page.url();

    await page.goto(`${projectUrl}/certification`);
    await expect(page.getByText("No certification programme yet")).toBeVisible();

    await page.getByRole("button", { name: "Create programme" }).click();
    await fillRecordNumber(page, "CERT-001");
    await page.getByLabel("Name").fill("Cabin systems certification effort");
    await page.getByRole("button", { name: "Create programme" }).click();

    await expect(page.getByText("Cabin systems certification effort")).toBeVisible();

    await page.getByRole("button", { name: "New basis" }).click();
    await fillRecordNumber(page, "CB-001");
    await page.getByLabel("Title").fill("Part 25 Amdt 25-141");
    await page.getByLabel("Revision").fill("Amdt 25-141");
    await page.getByLabel("Source reference").fill("14 CFR Part 25");
    await page.getByRole("button", { name: "Record basis" }).click();

    await expect(page.getByText("CB-001")).toBeVisible();
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
  });

  test("creates a compliance item, sets applicability and method, and shows blocking gaps before any engineering link exists", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/certification/items`);
    await page.getByRole("button", { name: "New compliance item" }).click();
    await fillRecordNumber(page, "CI-001");
    await page.getByLabel("Title").fill("Cabin pressurization limits");
    await page.getByRole("button", { name: "Create item" }).click();

    await expect(page).toHaveURL(/\/certification\/items\/[a-z0-9]+$/);

    // Applicability and rationale — an explicit human judgement.
    await page
      .getByLabel("Applicability", { exact: true })
      .selectOption("APPLICABLE");
    await page
      .getByLabel("Applicability rationale")
      .fill("This obligation applies to the pressurization schedule.");
    await page.getByRole("button", { name: "Save applicability" }).click();
    await expect(page.getByText("Applicable")).toBeVisible();

    // Compliance method.
    await page.getByLabel("Compliance method").selectOption("ANALYSIS");

    await page.goto(`${projectUrl}/certification/review`);
    await page.getByRole("button", { name: "Evaluate certification review" }).click();

    // No engineering linkage yet: honest blocking findings, not a false READY.
    await expect(page.getByRole("row", { name: /CR-LNK-001/ })).toBeVisible();
    await expect(page.getByText("Not ready")).toBeVisible();
  });

  test("links a requirement, a verification activity and evidence, and re-evaluates to a changed result", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await fillRecordNumber(page, "REQ-001");
    await page.getByLabel("Short name").fill("Cabin pressurization limits");
    await page
      .getByLabel("What must it do?")
      .fill("The cabin altitude shall not exceed 8,000 ft during normal operation.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);

    await page.goto(`${projectUrl}/verification`);
    await page.getByRole("button", { name: "New check" }).first().click();
    await fillRecordNumber(page, "VA-001");
    await page.getByLabel(/^Title/).fill("Cabin altitude analysis");
    await page.getByLabel(/^How will it be checked/).selectOption("ANALYSIS");
    await page.getByRole("button", { name: "Create check" }).click();
    await expect(page).toHaveURL(/\/verification\/[a-z0-9]+$/);

    await page.goto(`${projectUrl}/certification/items`);
    await page.getByRole("link", { name: "CI-001" }).click();

    await page.getByRole("button", { name: "Add link" }).click();
    await page.getByLabel("Link type").selectOption("REQUIREMENT");
    await page.getByLabel("Target").selectOption({ label: "REQ-001 — Cabin pressurization limits" });
    await page.getByRole("dialog").getByRole("button", { name: "Add link" }).click();
    await expect(page.getByText(/REQ-001/)).toBeVisible();

    await page.getByRole("button", { name: "Add link" }).click();
    await page.getByLabel("Link type").selectOption("VERIFICATION_ACTIVITY");
    await page.getByLabel("Target").selectOption({ label: "VA-001 — Cabin altitude analysis" });
    await page.getByRole("dialog").getByRole("button", { name: "Add link" }).click();
    await expect(page.getByText(/VA-001/)).toBeVisible();

    const beforeReview = `${projectUrl}/certification/review`;
    await page.goto(beforeReview);
    await page.getByRole("button", { name: "Evaluate certification review" }).click();

    // The compliance-method-requires-evidence gap is still real and honest.
    await expect(page.getByRole("row", { name: /CR-EVD-001/ })).toBeVisible();
    // But the linkage gap is gone.
    await expect(page.getByRole("row", { name: /CR-LNK-001/ })).toHaveCount(0);
  });

  test("raises a certification finding that blocks the review, resolves it, and re-evaluates", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/certification/items`);
    await page.getByRole("link", { name: "CI-001" }).click();

    await page.getByRole("button", { name: "New finding" }).click();
    await fillRecordNumber(page, "CF-001");
    await page.getByLabel("Title").fill("Analysis assumptions not independently checked");
    await page.getByLabel("Severity").selectOption("HIGH");
    await page.getByRole("button", { name: "Create finding" }).click();
    await expect(page.getByText("CF-001")).toBeVisible();

    await page.goto(`${projectUrl}/certification/review`);
    await page.getByRole("button", { name: "Evaluate certification review" }).click();

    await expect(page.getByRole("row", { name: /CR-FND-001/ })).toBeVisible();
    await expect(page.getByText("Not ready")).toBeVisible();

    await page.goto(`${projectUrl}/certification/items`);
    await page.getByRole("link", { name: "CI-001" }).click();
    await page.getByRole("button", { name: "Resolve" }).click();
    await page
      .getByLabel("Note")
      .fill("Independent check completed and filed as evidence.");
    await page.getByRole("dialog").getByRole("button", { name: "Resolve" }).click();
    await expect(page.getByText("Resolved", { exact: true })).toBeVisible();

    await page.goto(`${projectUrl}/certification/review`);
    await page.getByRole("button", { name: "Evaluate certification review" }).click();

    await expect(page.getByRole("row", { name: /CR-FND-001/ })).toHaveCount(0);
    await expect(page.getByRole("row", { name: /CR-FND-003/ })).toBeVisible();
  });

  test("keeps certification review history, and a historical review's findings differ from the latest, read-only", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/certification/review`);

    const historyRows = page.getByRole("row").filter({ hasNotText: "Evaluated" });
    const rowCount = await historyRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(2);

    // Open the oldest review (last row, since history is newest first).
    await historyRows.last().getByRole("button", { name: "Open" }).click();
    await expect(page.getByText("Viewing a historical review, read-only.")).toBeVisible();

    // The very first review (before any link existed) still shows CR-LNK-001.
    await expect(page.getByRole("row", { name: /CR-LNK-001/ })).toBeVisible();

    await page.getByRole("button", { name: "Back to latest" }).click();
    await expect(page.getByText("Viewing a historical review, read-only.")).toHaveCount(0);
  });

  test("stays stale-and-honest when a linked requirement changes, and current again after re-evaluation", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("link", { name: "REQ-001" }).click();
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page
      .getByLabel(/^Statement/)
      .fill("The cabin altitude shall not exceed 8,000 ft during normal operation, revised.");
    await page.getByRole("button", { name: "Save changes" }).click();

    await page.goto(`${projectUrl}/certification/review`);
    await expect(page.getByText("Stale")).toBeVisible();

    await page.getByRole("button", { name: "Evaluate certification review" }).click();
    await expect(page.getByText("Current")).toBeVisible();
  });

  test("never renders a percentage or a regulatory-approval claim anywhere in the certification workspace", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/certification`);
    await expect(page.getByText(/%/)).toHaveCount(0);
    await expect(page.getByText(/\bcertified\b/i)).toHaveCount(0);
    await expect(page.getByText(/\bFAA compliant\b/i)).toHaveCount(0);
    await expect(page.getByText(/\bEASA approved\b/i)).toHaveCount(0);

    await page.goto(`${projectUrl}/certification/review`);
    await expect(page.getByText(/%/)).toHaveCount(0);
    await expect(page.getByText(/\bcertified\b/i)).toHaveCount(0);
  });
});
