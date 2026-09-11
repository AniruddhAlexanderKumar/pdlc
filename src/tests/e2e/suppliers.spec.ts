import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount } from "./helpers";

/**
 * Supplier engineering, end to end:
 *
 *   sign in → project → design item, requirement, verification activity
 *   → supplier → supplied item → qualification
 *   → link the item to design, requirement and verification
 *   → raise a change → declare the supplied item as impacted
 *   → run the *existing* impact analysis
 *   → verify the downstream engineering findings and their provenance
 *
 * Every step writes to PostgreSQL through the real API. The point of the last
 * few steps is that no supplier-specific engine is involved: the ordinary change
 * request and the ordinary impact analysis do the work.
 */

test.describe.serial("Supplier engineering", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Suppliers ${stamp}`;
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let supplierUrl: string;
  let itemUrl: string;
  let changeUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "suppliers");
      return;
    }
    await signIn(page, account);
  });

  test("builds the engineering objects a supplied item will attach to", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: projectName }).click();
    await page.waitForURL(/\/projects\/[a-z0-9]+$/);
    projectUrl = page.url();

    await page.goto(`${projectUrl}/design-items`);
    await page.getByRole("button", { name: "New design item" }).first().click();
    await page.getByLabel("Identifier").fill("DI-001");
    await page.getByLabel(/^Name/).fill("Combustion chamber");
    await page.getByRole("button", { name: "Create design item" }).click();
    await expect(page).toHaveURL(/\/design-items\/[a-z0-9]+$/);

    await page.goto(`${projectUrl}/verification`);
    await page.getByRole("button", { name: "New activity" }).first().click();
    await page.getByLabel("Identifier").fill("VA-001");
    await page.getByLabel(/^Title/).fill("Tensile coupon test");
    await page.getByRole("button", { name: "Create activity" }).click();
    await expect(page).toHaveURL(/\/verification\/[a-z0-9]+$/);

    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await page.getByLabel("Identifier").fill("REQ-001");
    await page.getByLabel(/^Title/).fill("Chamber material strength");
    await page.getByLabel(/^Statement/).fill("The chamber shall withstand 120 bar at 900 K.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);
  });

  test("reaches the supplier workspace from the project", async ({ page }) => {
    await page.goto(projectUrl);

    // The project workspace now lists Suppliers as a real, openable module.
    const row = page.getByText("Suppliers", { exact: true });
    await expect(row).toBeVisible();

    await page.goto(`${projectUrl}/suppliers`);
    await expect(page.getByRole("heading", { name: "Suppliers" })).toBeVisible();
    await expect(page.getByText(/Not a procurement record/i)).toBeVisible();
    await expect(page.getByText(/No suppliers yet/i)).toBeVisible();
  });

  test("records a supplier", async ({ page }) => {
    await page.goto(`${projectUrl}/suppliers`);

    await page.getByRole("button", { name: "New supplier" }).first().click();
    await page.getByLabel("Identifier").fill("SUP-001");
    await page.getByLabel(/^Name/).fill("Vulcan Alloys");
    await page.getByLabel(/^Description/).fill("Nickel superalloy billet and forgings.");
    await page.getByRole("button", { name: "Create supplier" }).click();

    await expect(page).toHaveURL(/\/suppliers\/[a-z0-9]+$/);
    supplierUrl = page.url();

    await expect(page.getByRole("heading", { name: "Vulcan Alloys" })).toBeVisible();
    // A supplier with nothing supplied reaches no engineering, and says so.
    await expect(
      page.getByText(/a change to this supplier will find nothing until an item is added/i),
    ).toBeVisible();
  });

  test("records what the supplier provides", async ({ page }) => {
    await page.goto(supplierUrl);

    await page.getByRole("button", { name: "New supplied item" }).click();
    await page.getByLabel("Identifier").fill("SI-001");
    await page.getByLabel(/^Name/).fill("Inconel 718 billet");
    await page.getByLabel("Item type").selectOption("MATERIAL");
    await page.getByRole("button", { name: "Create supplied item" }).click();

    await expect(page).toHaveURL(/\/supplied-items\/[a-z0-9]+$/);
    itemUrl = page.url();

    await expect(page.getByRole("heading", { name: "Inconel 718 billet" })).toBeVisible();
    await expect(page.getByText("Material")).toBeVisible();
    // Nothing linked yet: the page is explicit that impact would find nothing.
    await expect(page.getByText(/will produce no downstream findings/i)).toBeVisible();
  });

  test("records a qualification without deriving its status", async ({ page }) => {
    await page.goto(supplierUrl);

    await page.getByRole("button", { name: "New qualification" }).click();
    await page.getByLabel(/^Title/).fill("VIM/VAR material qualification");
    await page.getByLabel("Qualification type").selectOption("MATERIAL");
    await page.getByLabel("Supplied item").selectOption({ index: 1 });
    await page.getByLabel("Evidence reference").fill("QMS-2026-114");
    // Deliberately already past: the status must not move on its own.
    await page.getByLabel("Expiry date").fill("2020-01-01");
    await page.getByRole("button", { name: "Create qualification" }).click();

    await expect(page.getByRole("link", { name: /VIM\/VAR material qualification/ })).toBeVisible();

    await page.getByRole("link", { name: /VIM\/VAR material qualification/ }).click();
    await expect(page).toHaveURL(/\/supplier-qualifications\/[a-z0-9]+$/);

    // Recorded status stands; the passed date is reported as a fact, not acted on.
    await expect(page.getByText("Planned")).toBeVisible();
    await expect(page.getByText(/The recorded expiry date has passed/i)).toBeVisible();
    await expect(page.getByText(/not one this system will make/i)).toBeVisible();
    await expect(page.getByText(/not a certification record/i)).toBeVisible();
  });

  test("links the supplied item into the product", async ({ page }) => {
    await page.goto(itemUrl);

    // Each link is confirmed by the identifier it added appearing in the list,
    // so the next selection cannot race the refresh.
    const linked: Array<[string, RegExp]> = [
      ["DESIGN_ITEM", /DI-001/],
      ["REQUIREMENT", /REQ-001/],
      ["VERIFICATION_ACTIVITY", /VA-001/],
    ];

    for (const [relation, expected] of linked) {
      await page.getByLabel("Relationship").selectOption(relation);
      await page.getByLabel("Artifact").selectOption({ index: 1 });
      await page.getByRole("button", { name: /add link/i }).click();
      await expect(page.getByText(expected).first()).toBeVisible();
    }

    // With engineering dependencies recorded, the "reaches nothing" notice goes.
    await expect(page.getByText(/will produce no downstream findings/i)).toHaveCount(0);
  });

  test("declares the supplied item on an ordinary change request", async ({ page }) => {
    await page.goto(`${projectUrl}/changes`);
    await page.getByRole("button", { name: "New change request" }).first().click();
    await page.getByLabel("Identifier").fill("CR-001");
    await page.getByLabel(/^Title/).fill("Second-source the chamber billet");
    await page.getByLabel(/^Description/).fill("Qualify a second billet supplier.");
    await page.getByLabel(/^Reason/).fill("Single-source lead time risk.");
    await page.getByRole("button", { name: "Create change request" }).click();

    await expect(page).toHaveURL(/\/changes\/[a-z0-9]+$/);
    changeUrl = page.url();

    // The same change request as any other — there is no SupplierChangeRequest.
    await page.getByLabel("Artifact type").selectOption("SUPPLIED_ITEM");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /declare impact/i }).click();

    await expect(page.getByText("SI-001")).toBeVisible();
    await expect(page.getByText("Supplied item")).toBeVisible();
  });

  test("runs the existing impact analysis and reaches engineering", async ({ page }) => {
    await page.goto(changeUrl);

    await page.getByRole("button", { name: /run impact analysis/i }).click();
    await expect(page.getByLabel("Impact summary")).toBeVisible();

    // The declared supplied item is DIRECT.
    await expect(page.getByRole("row", { name: /SI-001/ })).toContainText("Direct");

    // Design, requirement and verification are reached by propagation, and each
    // crosses out of the supply domain.
    const designRow = page.getByRole("row", { name: /DI-001/ });
    await expect(designRow).toContainText("Cross-domain");
    await expect(designRow).toContainText("Potentially affected");

    await expect(page.getByRole("row", { name: /REQ-001/ })).toContainText("Cross-domain");

    const verificationRow = page.getByRole("row", { name: /VA-001/ });
    await expect(verificationRow).toContainText("Cross-domain");
    // Reached, not failed.
    await expect(verificationRow).not.toContainText("Failed");
  });

  test("explains why the design item was reached", async ({ page }) => {
    await page.goto(changeUrl);

    const designRow = page.getByRole("row", { name: /DI-001/ });
    await designRow.getByRole("button").click();

    // The real edge that was walked, named in the canonical registry.
    await expect(page.getByText("SUPPLIED_ITEM_ALLOCATED_TO_DESIGN")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Path" })).toBeVisible();
  });

  test("surfaces the qualification without judging it", async ({ page }) => {
    await page.goto(changeUrl);

    const qualificationRow = page.getByRole("row", { name: /VIM\/VAR/ });
    await expect(qualificationRow).toBeVisible();
    await qualificationRow.getByRole("button").click();

    // Reached because the change disturbs what it was granted against — the
    // engine explicitly does not say whether it still holds.
    await expect(page.getByText("qualification validity not evaluated")).toBeVisible();
  });

  test("produces one analysis, with no supplier score anywhere", async ({ page }) => {
    const apiPath = changeUrl.replace(/^https?:\/\/[^/]+/, "").replace("/projects/", "/api/projects/");

    const response = await page.request.get(`${apiPath}/impact-analysis/latest`);
    expect(response.ok()).toBe(true);

    const { latest } = await response.json();
    expect(latest.analysis.changeRequestId).toBeTruthy();
    // Supplier objects and engineering objects in one report.
    const types = latest.findings.map((f: { node: { type: string } }) => f.node.type);
    expect(types).toContain("SUPPLIED_ITEM");
    expect(types).toContain("DESIGN_ITEM");

    expect(JSON.stringify(latest)).not.toMatch(/supplierScore|health|rating|reliability/i);
  });

  test("keeps supplier records out of another project", async ({ page }) => {
    // A second project in the same organization must not see the first's
    // suppliers: the tenancy boundary is the project, not the organization.
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(`[E2E] Suppliers isolated ${stamp}`);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: `[E2E] Suppliers isolated ${stamp}` }).click();
    await page.waitForURL(/\/projects\/[a-z0-9]+$/);

    await page.goto(`${page.url()}/suppliers`);
    await expect(page.getByText(/No suppliers yet/i)).toBeVisible();
    await expect(page.getByText("SUP-001")).toHaveCount(0);
  });
});
