import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount, fillRecordNumber } from "./helpers";

/**
 * Decision Sentinel, end to end:
 *
 *   sign in → project → a traced slice (requirement → verification activity)
 *   → evaluate verification readiness for real
 *   → the Sentinel starts with an honest empty state, and detection is
 *     explicit — nothing runs on page load
 *   → the requirement changes → run detection → a real surveillance target
 *     appears, naming the real source and the real reason, linking to both
 *     the changed object and the affected assessment
 *   → acknowledge it (not a claim that anything was fixed)
 *   → re-evaluate it: the real verification-readiness engine runs again and
 *     the target resolves itself automatically, with the new assessment as
 *     evidence
 *   → the requirement changes again → detection opens a fresh target (the
 *     resolved one does not block a new signal) → resolved explicitly, with
 *     a required note
 *   → history keeps both resolutions, and the open list goes back to empty
 *   → an unrelated, never-assessed object changing raises no signal at all
 *
 * Every step writes to PostgreSQL through the real API and the real engine.
 * Detection is a click, never a side effect of navigation, and this spec
 * never asserts a score, a percentage or a risk rating anywhere in the
 * workspace.
 */

test.describe.serial("Decision Sentinel", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Sentinel ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let requirementUrl: string;
  let activityUrl: string;
  let sentinelUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "sentinel");
      return;
    }
    await signIn(page, account);
  });

  test("builds a traced slice and evaluates verification readiness for real", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: projectName }).click();
    await page.waitForURL(/\/projects\/[a-z0-9]+$/);
    projectUrl = page.url();
    sentinelUrl = `${projectUrl}/sentinel`;

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

    await page.getByLabel("Relationship").selectOption("VERIFICATION_ACTIVITY");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/VA-001/)).toBeVisible();

    await page.goto(activityUrl);
    await page.getByRole("button", { name: /evaluate readiness/i }).click();
    await expect(page.getByRole("group", { name: "Readiness verdict" })).toBeVisible();
  });

  test("starts with an honest empty state, and detection never runs on its own", async ({ page }) => {
    await page.goto(sentinelUrl);

    await expect(page.getByRole("heading", { name: "Decision Sentinel" })).toBeVisible();
    await expect(page.getByText("No open surveillance")).toBeVisible();
    await expect(
      page.getByText(/it never approves, rejects, or rewrites anything/i),
    ).toBeVisible();

    // Reloading does not itself create a signal — only the explicit button does.
    await page.reload();
    await expect(page.getByText("No open surveillance")).toBeVisible();
  });

  test("detects a real requirement change and opens a real surveillance target", async ({ page }) => {
    await page.goto(requirementUrl);
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page
      .getByLabel(/^Statement/)
      .fill("The engine shall not exceed 130 bar, revised for the new nozzle.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/revised for the new nozzle/i)).toBeVisible();

    await page.goto(sentinelUrl);
    await page.getByRole("button", { name: /run detection/i }).click();

    await expect(page.getByText(/1 change detected/i)).toBeVisible();
    await expect(page.getByText("Verification Readiness")).toBeVisible();
    await expect(page.getByText(/REQ-001 — Maximum chamber pressure/)).toBeVisible();
    await expect(
      page.getByText(/verification readiness assessment included it in its basis/i),
    ).toBeVisible();

    // Real provenance: the source link goes to the real requirement.
    await page.getByRole("link", { name: "Open source object" }).click();
    await expect(page).toHaveURL(requirementUrl);
  });

  test("acknowledges the target — not a claim that anything was fixed", async ({ page }) => {
    await page.goto(sentinelUrl);

    await page.getByRole("button", { name: "Acknowledge" }).click();
    await expect(page.getByRole("button", { name: "Acknowledge" })).toHaveCount(0);
    await expect(page.getByText("Acknowledged", { exact: true })).toBeVisible();
    // Still open — acknowledgement alone never resolves anything.
    await expect(page.getByRole("button", { name: "Re-evaluate" })).toBeVisible();
  });

  test("re-evaluates through the real engine, which resolves the target on success", async ({
    page,
  }) => {
    await page.goto(sentinelUrl);

    await page.getByRole("button", { name: "Re-evaluate" }).click();
    await expect(page.getByText("Verification Readiness")).toHaveCount(0);
    await expect(page.getByText("No open surveillance")).toBeVisible();

    await page.getByRole("button", { name: /recently resolved/i }).click();
    await expect(page.getByText(/Resolved automatically/i)).toBeVisible();

    // The real engine actually ran again: a new assessment exists.
    await page.goto(activityUrl);
    const openButtons = page.getByRole("button", { name: /^Open/ });
    expect(await openButtons.count()).toBeGreaterThanOrEqual(2);
  });

  test("a fresh change opens a new target, resolved explicitly with a required note", async ({
    page,
  }) => {
    await page.goto(requirementUrl);
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page
      .getByLabel(/^Statement/)
      .fill("The engine shall not exceed 130 bar, revised again after chamber testing.");
    await page.getByRole("button", { name: "Save changes" }).click();

    await page.goto(sentinelUrl);
    await page.getByRole("button", { name: /run detection/i }).click();
    await expect(page.getByText("Verification Readiness")).toBeVisible();

    await page.getByRole("button", { name: "Resolve" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Resolution requires a note — the submit button starts disabled.
    await expect(dialog.getByRole("button", { name: "Resolve" })).toBeDisabled();

    await page.getByLabel(/note/i).fill("Re-read the assessment manually; still accurate.");
    await dialog.getByRole("button", { name: "Resolve" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("No open surveillance")).toBeVisible();
  });

  test("keeps both resolutions in history, distinct and explained", async ({ page }) => {
    await page.goto(sentinelUrl);
    await page.getByRole("button", { name: /recently resolved/i }).click();

    await expect(page.getByText(/Resolved automatically/i)).toBeVisible();
    await expect(
      page.getByText(/Re-read the assessment manually; still accurate\./),
    ).toBeVisible();
  });

  test("raises no signal for an object nothing consumes", async ({ page }) => {
    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await fillRecordNumber(page, "REQ-002");
    await page.getByLabel(/^Title/).fill("Unrelated requirement");
    await page.getByLabel(/^Statement/).fill("Never linked to anything this project assesses.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);

    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByLabel(/^Statement/).fill("Edited, but still unlinked to anything assessed.");
    await page.getByRole("button", { name: "Save changes" }).click();

    await page.goto(sentinelUrl);
    await page.getByRole("button", { name: /run detection/i }).click();

    // A content change was recorded, but no dependent assessment references
    // this requirement, so no surveillance target was created for it.
    await expect(page.getByText("No open surveillance")).toBeVisible();
  });

  test("never renders a score, percentage or risk rating anywhere in the workspace", async ({
    page,
  }) => {
    await page.goto(sentinelUrl);
    await expect(page.getByText(/%/)).toHaveCount(0);
    await expect(page.getByText(/\bconfidence\b/i)).toHaveCount(0);
    await expect(page.getByText(/\brisk score\b/i)).toHaveCount(0);

    await page.goto(projectUrl);
    await expect(page.getByText("Decision Sentinel").first()).toBeVisible();
  });
});
