import { expect, test, type Page } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount, type E2EAccount, fillRecordNumber } from "./helpers";

/**
 * Engineering Access Control, end to end:
 *
 *   owner signs up (creating an organization and its first project) →
 *   provisions three more real accounts and assigns each a distinct
 *   project role through the real Members page → an ENGINEER creates a
 *   requirement and moves it into review, but cannot approve it → a
 *   REVIEWER cannot create a requirement, but can approve the one the
 *   engineer moved into review → a VIEWER can read a supplier (one of the
 *   modules completed in a later authorization-coverage pass) but cannot
 *   create one, and a non-member cannot even read it → a VIEWER can read
 *   the project but cannot mutate anything → a same-organization user
 *   with *no* project membership cannot reach the project at all (404,
 *   indistinguishable from "does not exist") → a requirement title crafted
 *   to look like a script-injection payload renders as inert text, never
 *   executes → the owner removes a member, and that member immediately
 *   loses access.
 *
 * Every check here goes through the real UI and the real API — server
 * enforcement, not a hidden button standing in for it. Several requirement
 * detail pages deliberately still render every lifecycle button regardless
 * of the caller's role (project-role-aware hiding was only built for the
 * Members page itself — a disclosed scope decision, see ARCHITECTURE.md's
 * Engineering Access Control section), so a rejected click is exactly the
 * proof this spec needs: the server blocked it, not the UI.
 */

const PASSWORD = "e2e correct horse battery staple";

function stampedAccount(label: string, stamp: number): E2EAccount {
  return {
    email: `e2e-access-${label}-${stamp}@example.test`,
    password: PASSWORD,
    organizationName: "",
  };
}

async function provisionOrganizationMember(page: Page, name: string, account: E2EAccount) {
  await page.getByRole("button", { name: /provision a new organization account/i }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel(/temporary password/i).fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function addProjectMember(
  page: Page,
  name: string,
  account: E2EAccount,
  role: "ENGINEER" | "REVIEWER" | "VIEWER",
) {
  await page.getByLabel("Organization member").selectOption({ label: `${name} (${account.email})` });
  await page.getByLabel("Role").selectOption(role);
  await page.getByRole("button", { name: "Add to project" }).click();
  await expect(page.getByText(account.email)).toBeVisible();
}

test.describe.serial("Engineering Access Control", () => {
  const stamp = Date.now();
  const projectName = `[E2E] Access Control ${stamp}`;

  const engineer = stampedAccount("engineer", stamp);
  const reviewer = stampedAccount("reviewer", stamp);
  const viewer = stampedAccount("viewer", stamp);
  const outsider = stampedAccount("outsider", stamp); // same organization, never added to the project

  let owner: E2EAccount;
  let projectUrl: string;
  let requirementUrl: string;

  test.beforeEach(async ({ request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");
  });

  test("owner creates a project and provisions four more real accounts with distinct project roles", async ({
    page,
  }) => {
    owner = await signUpNewAccount(page, "access-control");

    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("link", { name: projectName }).click();
    await page.waitForURL(/\/projects\/[a-z0-9]+$/);
    projectUrl = page.url();

    await page.goto(`${projectUrl}/members`);
    await expect(page.getByText(/your role on this project/i)).toBeVisible();
    await expect(page.getByText("Manager", { exact: true })).toBeVisible();

    await provisionOrganizationMember(page, "E2E Engineer", engineer);
    await provisionOrganizationMember(page, "E2E Reviewer", reviewer);
    await provisionOrganizationMember(page, "E2E Viewer", viewer);
    // Provisioned into the organization but deliberately never added to the
    // project — the "same org, no project membership" boundary this
    // capability exists to enforce.
    await provisionOrganizationMember(page, "E2E Outsider", outsider);

    await addProjectMember(page, "E2E Engineer", engineer, "ENGINEER");
    await addProjectMember(page, "E2E Reviewer", reviewer, "REVIEWER");
    await addProjectMember(page, "E2E Viewer", viewer, "VIEWER");

    // Four explicit rows now exist, none of them the owner (who needs none).
    await expect(page.getByRole("row")).toHaveCount(5); // header + 4 members
  });

  test("an ENGINEER creates a requirement and moves it into review, but cannot approve it", async ({
    page,
  }) => {
    await signIn(page, engineer);

    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await fillRecordNumber(page, "REQ-001");
    await page.getByLabel("Short name").fill("Maximum chamber pressure");
    await page.getByLabel("What must it do?").fill("The engine shall not exceed 120 bar chamber pressure.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);
    requirementUrl = page.url();

    await page.getByRole("button", { name: "Move to in review" }).click();
    await expect(page.getByText("Currently in review.")).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("alert").getByText(/blocked/i)).toBeVisible();
    // The rejected click changed nothing: still in review, not approved.
    await expect(page.getByText("Currently in review.")).toBeVisible();
  });

  test("a VIEWER can read but not create a supplier, and a non-member cannot even read it — one of the modules completed in the follow-up pass", async ({
    page,
  }) => {
    await signIn(page, engineer);
    await page.goto(`${projectUrl}/suppliers`);
    await page.getByRole("button", { name: "New supplier" }).first().click();
    await fillRecordNumber(page, "SUP-001");
    await page.getByLabel(/^Name/).fill("Vulcan Alloys");
    await page.getByLabel(/^Description/).fill("Nickel superalloy billet and forgings.");
    await page.getByRole("button", { name: "Create supplier" }).click();
    await expect(page).toHaveURL(/\/suppliers\/[a-z0-9]+$/);
    const supplierUrl = page.url();

    await signIn(page, viewer);
    await page.goto(supplierUrl);
    await expect(page.getByRole("heading", { name: /SUP-001/ })).toBeVisible();

    await page.goto(`${projectUrl}/suppliers`);
    await page.getByRole("button", { name: "New supplier" }).first().click();
    await fillRecordNumber(page, "SUP-002");
    await page.getByLabel(/^Name/).fill("Should never be created");
    await page.getByLabel(/^Description/).fill("A viewer has no write authority.");
    await page.getByRole("button", { name: "Create supplier" }).click();
    await expect(page.getByRole("alert").getByText(/blocked/i)).toBeVisible();

    // Unlike Requirements, this module's *reads* are also project-membership
    // gated — a same-organization non-member gets 404, not just on writes.
    await signIn(page, outsider);
    await page.goto(supplierUrl);
    await expect(page.getByText(/no longer exists, or you do not have access/i)).toBeVisible();
  });

  test("a REVIEWER cannot create a requirement, but can approve the one the engineer moved into review", async ({
    page,
  }) => {
    await signIn(page, reviewer);

    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await fillRecordNumber(page, "REQ-002");
    await page.getByLabel("Short name").fill("Should never be created");
    await page.getByLabel("What must it do?").fill("A reviewer has no write authority.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page.getByRole("alert").getByText(/blocked/i)).toBeVisible();

    await page.goto(requirementUrl);
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Currently approved.")).toBeVisible();
  });

  test("a VIEWER can read the project but cannot mutate anything", async ({ page }) => {
    await signIn(page, viewer);

    await page.goto(requirementUrl);
    await expect(page.getByRole("heading", { name: /REQ-001/ })).toBeVisible();
    await expect(page.getByText("Currently approved.")).toBeVisible();

    // APPROVED → BASELINED is itself an approval-tier transition; a VIEWER
    // has neither write nor approve authority.
    await page.getByRole("button", { name: "Baseline" }).click();
    await expect(page.getByRole("alert").getByText(/blocked/i)).toBeVisible();
    await expect(page.getByText("Currently approved.")).toBeVisible();

    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await fillRecordNumber(page, "REQ-003");
    await page.getByLabel("Short name").fill("Should never be created");
    await page.getByLabel("What must it do?").fill("A viewer has no write authority.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page.getByRole("alert").getByText(/blocked/i)).toBeVisible();
  });

  test("a same-organization user with no project membership cannot reach the project at all", async ({
    page,
  }) => {
    await signIn(page, outsider);

    await page.goto(requirementUrl);
    // Indistinguishable from "this project does not exist" — never a 403.
    await expect(page.getByText(/no longer exists, or you do not have access/i)).toBeVisible();

    await page.goto(projectUrl);
    await expect(page.getByText(/no longer exists, or you do not have access/i)).toBeVisible();
  });

  test("a malicious title is rendered as literal text, never executed", async ({ page }) => {
    await signIn(page, engineer);

    const payload = '<img src=x onerror="window.__xssFired = true">Injected';
    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await fillRecordNumber(page, "REQ-XSS");
    await page.getByLabel("Short name").fill(payload);
    await page.getByLabel("What must it do?").fill("The system shall reject nothing typed into a text field.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);

    // The exact string appears as literal, visible text — proof React
    // escaped it rather than the browser silently dropping an unrenderable
    // tag some other way.
    await expect(page.getByText(payload, { exact: false })).toBeVisible();
    // The strongest proof: the injected onerror handler never ran. A real
    // XSS would have set this before the page finished settling.
    const fired = await page.evaluate(() => (window as unknown as { __xssFired?: boolean }).__xssFired);
    expect(fired).toBeUndefined();
    // No broken/real <img> was parsed out of the title into the live DOM.
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
  });

  test("the owner removes a member, and that member immediately loses access", async ({ page }) => {
    await signIn(page, owner);

    await page.goto(`${projectUrl}/members`);
    await page.getByRole("button", { name: /remove e2e viewer/i }).click();
    await expect(page.getByRole("button", { name: /remove e2e viewer/i })).toHaveCount(0);

    await signIn(page, viewer);
    await page.goto(requirementUrl);
    await expect(page.getByText(/no longer exists, or you do not have access/i)).toBeVisible();
  });
});
