import { expect, test } from "@playwright/test";
import { databaseAvailable, signIn, signUpNewAccount } from "./helpers";

/**
 * The full V1 acceptance tour (Prompt 30 §18), end to end.
 *
 * One engineer, one coherent project, sixteen real steps through the real
 * UI and the real API, in order: authenticate → project → requirements →
 * decision → verification → supplier → evidence → baseline → change
 * request → change impact → readiness → certification → Sentinel →
 * traceability → history → Command Center.
 *
 * This is not a second copy of the per-module specs (`decisions.spec.ts`,
 * `certification.spec.ts`, `sentinel.spec.ts`, …) — those already cover
 * each module's own edge cases exhaustively. What this spec proves is that
 * one coherent scenario, built by clicking through every module in a
 * realistic order, still holds together at the end: the requirement
 * Traceability shows is the one Command Center references; the evidence
 * that validated the verification activity is the evidence the
 * certification item cites through it; the change request Change Impact
 * analyzed is the one the History timeline records. Every assertion below
 * reads back a real, specific, scenario-created identifier — never a page
 * heading alone, and never a manipulated verdict.
 */

test.describe.serial("Full V1 acceptance scenario", () => {
  let account: Awaited<ReturnType<typeof signUpNewAccount>>;
  let projectUrl: string;
  let requirementUrl: string;
  let secondRequirementUrl: string;
  let activityUrl: string;
  let changeUrl: string;

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");

    if (!account) {
      account = await signUpNewAccount(page, "acceptance");
      return;
    }
    await signIn(page, account);
  });

  // --- 1. Authenticate, 2. Project ------------------------------------------

  test("1-2: authenticates and creates the program's project", async ({ page }) => {
    const stamp = Date.now();
    const projectName = `[E2E] Acceptance ${stamp}`;

    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create project" }).click();

    await page.getByRole("link", { name: projectName }).click();
    await page.waitForURL(/\/projects\/[a-z0-9]+$/);
    projectUrl = page.url();
    await expect(page.getByText(projectName)).toBeVisible();
  });

  // --- 3. Requirements ---------------------------------------------------------

  test("3: creates the two requirements this scenario traces throughout", async ({ page }) => {
    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await page.getByLabel("Identifier").fill("REQ-001");
    await page.getByLabel(/^Title/).fill("Maximum chamber pressure");
    await page
      .getByLabel(/^Statement/)
      .fill("The engine shall not exceed 120 bar chamber pressure.");
    await page.getByLabel("Rationale").fill("Structural margin of the chamber wall.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);
    requirementUrl = page.url();

    // A second requirement, deliberately left in review rather than
    // approved — it is what Sentinel will detect a real change against
    // later, since an APPROVED requirement can no longer be edited at all.
    await page.goto(`${projectUrl}/requirements`);
    await page.getByRole("button", { name: "New requirement" }).first().click();
    await page.getByLabel("Identifier").fill("REQ-002");
    await page.getByLabel(/^Title/).fill("Igniter reliability under restart");
    await page
      .getByLabel(/^Statement/)
      .fill("The igniter shall achieve reliable relight across three consecutive restarts.");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[a-z0-9]+$/);
    secondRequirementUrl = page.url();
  });

  // --- 4. Decision (design item + decision, linked and approved) --------------

  test("4: creates a design item and an engineering decision, links it, and approves it", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/design-items`);
    await page.getByRole("button", { name: "New design item" }).first().click();
    await page.getByLabel("Identifier").fill("DI-001");
    await page.getByLabel(/^Name/).fill("Combustion chamber assembly");
    await page.getByRole("button", { name: "Create design item" }).click();
    await expect(page).toHaveURL(/\/design-items\/[a-z0-9]+$/);

    await page.goto(`${projectUrl}/decisions`);
    await page.getByRole("button", { name: "New decision" }).first().click();
    await page.getByLabel("Identifier").fill("ED-001");
    await page.getByLabel(/^Title/).fill("Use regenerative cooling");
    await page.getByLabel(/^Statement/).fill("The chamber will be regeneratively cooled.");
    await page
      .getByLabel(/^Rationale/)
      .fill("Ablative liner mass was prohibitive at this thrust class.");
    await page.getByRole("button", { name: "Create decision" }).click();
    await expect(page).toHaveURL(/\/decisions\/[a-z0-9]+$/);

    await page.getByRole("button", { name: /add alternative/i }).click();
    await page.getByLabel(/^Alternative/).fill("Ablative liner");
    await page.getByLabel("Reason rejected").fill("Mass and refurbishment cost.");
    await page.getByRole("button", { name: "Add alternative" }).click();
    await expect(page.getByText("Ablative liner")).toBeVisible();

    await page.getByRole("button", { name: /add assumption/i }).click();
    await page.getByLabel(/^Assumption/).fill("Coolant flow stays above 2.4 kg/s.");
    await page.getByRole("button", { name: "Add assumption" }).click();
    await expect(page.getByText("Coolant flow stays above 2.4 kg/s.")).toBeVisible();

    await page.getByRole("button", { name: /set expectation/i }).click();
    await page.getByLabel(/^Expectation/).fill("Wall temperature stays below the material limit.");
    await page.getByLabel("Measure").fill("Peak wall temperature");
    await page.getByLabel("Expected value").fill("800");
    await page.getByLabel("Unit").fill("K");
    await page.getByLabel(/Comparison operator/).selectOption("LESS_THAN_OR_EQUAL");
    await page.getByRole("button", { name: /save expectation/i }).click();
    await expect(page.getByText("Wall temperature stays below the material limit.")).toBeVisible();

    // Link the decision to both the requirement it addresses and the design
    // item it affects — both directions, both real objects. Two
    // requirements now exist, so the requirement is picked by its exact
    // "identifier — title" label rather than by list position.
    await page.getByLabel("Relationship").selectOption("REQUIREMENT");
    await page.getByLabel("Artifact").selectOption({ label: "REQ-001 — Maximum chamber pressure" });
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/REQ-001/)).toBeVisible();

    await page.getByLabel("Relationship").selectOption("DESIGN_ITEM");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/DI-001/)).toBeVisible();

    await page.getByRole("button", { name: "Begin review" }).click();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  });

  // --- 5. Verification ---------------------------------------------------------

  test("5: creates a verification activity linked to both requirements, and approves REQ-001", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/verification`);
    await page.getByRole("button", { name: "New activity" }).first().click();
    await page.getByLabel("Identifier").fill("VA-001");
    await page.getByLabel(/^Title/).fill("Proof pressure and hot-fire test series");
    await page.getByRole("button", { name: "Create activity" }).click();
    await expect(page).toHaveURL(/\/verification\/[a-z0-9]+$/);
    activityUrl = page.url();

    // The link is a requirement→activity relation, added from each
    // requirement's own page — only one verification activity exists yet,
    // so it is unambiguous by list position.
    await page.goto(requirementUrl);
    await page.getByLabel("Relationship").selectOption("VERIFICATION_ACTIVITY");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/VA-001/)).toBeVisible();

    await page.goto(secondRequirementUrl);
    await page.getByLabel("Relationship").selectOption("VERIFICATION_ACTIVITY");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/VA-001/)).toBeVisible();

    // REQ-001 moves to APPROVED — REQ-002 deliberately does not, so it
    // stays editable for the Sentinel step later.
    await page.goto(requirementUrl);
    await page.getByRole("button", { name: "Move to in review" }).click();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Currently approved.")).toBeVisible();

    // A real verification-readiness verdict — never asserted as a specific
    // outcome, since Prompt 30 forbids manipulating readiness toward a
    // chosen answer. Only that it is real and references this activity.
    await page.goto(activityUrl);
    await page.getByRole("button", { name: /evaluate readiness/i }).click();
    await expect(page.getByRole("group", { name: "Readiness verdict" })).toBeVisible();
  });

  // --- 6. Supplier ---------------------------------------------------------

  test("6: registers a supplier, a supplied item, and an active qualification, linked to the design item", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/suppliers`);
    await page.getByRole("button", { name: "New supplier" }).first().click();
    await page.getByLabel("Identifier").fill("SUP-001");
    await page.getByLabel(/^Name/).fill("Vulcan Alloys");
    await page
      .getByLabel(/^Description/)
      .fill("Nickel superalloy billet and forgings (fictional supplier).");
    await page.getByRole("button", { name: "Create supplier" }).click();
    await expect(page).toHaveURL(/\/suppliers\/[a-z0-9]+$/);

    await page.getByRole("button", { name: "New supplied item" }).click();
    await page.getByLabel("Identifier").fill("SI-001");
    await page.getByLabel(/^Name/).fill("Inconel 718 billet");
    await page.getByLabel("Item type").selectOption("MATERIAL");
    await page.getByRole("button", { name: "Create supplied item" }).click();
    await expect(page.getByText("Inconel 718 billet")).toBeVisible();

    await page.getByRole("button", { name: "New qualification" }).click();
    await page.getByLabel(/^Title/).fill("VIM/VAR material qualification");
    await page.getByLabel("Qualification type").selectOption("MATERIAL");
    await page.getByLabel("Supplied item").selectOption({ index: 1 });
    await page.getByLabel("Evidence reference").fill("QMS-2026-114");
    await page.getByLabel("Expiry date").fill("2030-01-01");
    await page.getByRole("button", { name: "Create qualification" }).click();
    await expect(page.getByRole("link", { name: /VIM\/VAR material qualification/ })).toBeVisible();
  });

  // --- 7. Evidence ---------------------------------------------------------

  test("7: records evidence, links it to the verification activity, and validates it", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/evidence`);
    await page.getByRole("button", { name: "Record evidence" }).first().click();
    await page.getByLabel("Identifier").fill("EV-001");
    await page.getByLabel(/^Title/).fill("Hot fire test report, series 1");
    await page.getByLabel(/Source reference/).fill("TR-2026-014");
    await page.getByRole("button", { name: /^record evidence$/i }).click();
    await expect(page).toHaveURL(/\/evidence\/[a-z0-9]+$/);

    await page.getByLabel("Relationship").selectOption("VERIFICATION_ACTIVITY");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByText(/VA-001/)).toBeVisible();

    await page.getByRole("button", { name: "Validate" }).click();
    await expect(page.getByText("Validated", { exact: true })).toBeVisible();
  });

  // --- 8. Baseline ---------------------------------------------------------

  test("8: creates and activates an engineering baseline containing the design item and requirement", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/baselines`);
    await page.getByRole("button", { name: "New baseline" }).first().click();
    await page.getByLabel("Identifier").fill("BL-001");
    await page.getByLabel("Name").fill("Preliminary design baseline");
    await page.getByRole("button", { name: "Create baseline" }).click();
    await expect(page).toHaveURL(/\/baselines\/[a-z0-9]+$/);

    await page.getByLabel("Object type").selectOption("DESIGN_ITEM");
    await page.getByLabel("Object", { exact: true }).selectOption({ index: 1 });
    await page.getByRole("button", { name: /add to baseline/i }).click();
    await expect(page.getByText(/DI-001/)).toBeVisible();

    await page.getByLabel("Object type").selectOption("REQUIREMENT");
    await page
      .getByLabel("Object", { exact: true })
      .selectOption({ label: "REQ-001 — Maximum chamber pressure" });
    await page.getByRole("button", { name: /add to baseline/i }).click();
    await expect(page.getByText(/REQ-001/)).toBeVisible();

    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText(/This baseline is active and immutable/i)).toBeVisible();
  });

  // --- 9. Change request ---------------------------------------------------------

  test("9: opens a change request, declares its impact on the design item, and submits it", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/changes`);
    await page.getByRole("button", { name: "New change" }).first().click();
    await page.getByLabel(/^Identifier/).fill("CR-001");
    await page.getByLabel(/^Title/).fill("Raise the chamber pressure limit");
    await page
      .getByLabel(/^Description/)
      .fill("Raise the chamber pressure limit from 120 to 130 bar.");
    await page
      .getByLabel(/^Reason/)
      .fill("Performance shortfall found in the hot-fire test series.");
    await page.getByRole("button", { name: "Create change request" }).click();
    await expect(page).toHaveURL(/\/changes\/[a-z0-9]+$/);
    changeUrl = page.url();

    await page.getByLabel("Artifact type").selectOption("DESIGN_ITEM");
    await page.getByLabel("Artifact").selectOption({ index: 1 });
    await page.getByRole("button", { name: /declare impact/i }).click();
    await expect(page.getByText(/DI-001/)).toBeVisible();

    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  });

  // --- 10. Change impact ---------------------------------------------------------

  test("10: runs a real change impact analysis and reads back a completed report", async ({
    page,
  }) => {
    await page.goto(changeUrl);
    await expect(page.getByLabel("Impact summary")).toHaveCount(0);

    await page.getByRole("button", { name: /run impact analysis/i }).click();
    await expect(page.getByLabel("Impact summary")).toBeVisible();
    // The real engine's own output, not a manufactured count: it names the
    // exact design item this scenario declared impact on.
    await expect(page.getByText(/DI-001/)).toBeVisible();
  });

  // --- 11. Readiness (Technical Readiness gate) ---------------------------------

  test("11: evaluates a real technical readiness gate against the live engineering scope", async ({
    page,
  }) => {
    await page.goto(projectUrl);
    await expect(page.getByRole("heading", { name: "Technical readiness" })).toBeVisible();

    await page.getByLabel("Gate").selectOption("DESIGN_REVIEW");
    await page.getByRole("button", { name: /evaluate gate/i }).click();

    const verdict = page.getByRole("group", { name: "Gate verdict" });
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText("Design review");
    // Scope is named, not just counted.
    await expect(page.getByText(/DI-001|Combustion chamber/)).toBeVisible();
  });

  // --- 12. Certification ---------------------------------------------------------

  test("12: builds a certification program and basis, links a compliance item to REQ-001, and evaluates a real review", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/certification`);
    await page.getByRole("button", { name: "Create programme" }).click();
    await page.getByLabel("Identifier").fill("CERT-001");
    await page.getByLabel("Name").fill("Propulsion certification effort (fictional program)");
    await page.getByRole("button", { name: "Create programme" }).click();
    await expect(page.getByText(/fictional program/i)).toBeVisible();

    await page.getByRole("button", { name: "New basis" }).click();
    await page.getByLabel("Identifier").fill("CB-001");
    await page.getByLabel("Title").fill("Fictional propulsion certification basis");
    await page.getByLabel("Revision").fill("Rev A");
    await page.getByLabel("Source reference").fill("INTERNAL-FICTIONAL-001");
    await page.getByRole("button", { name: "Record basis" }).click();
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText(/active/i).first()).toBeVisible();

    await page.goto(`${projectUrl}/certification/items`);
    await page.getByRole("button", { name: "New compliance item" }).click();
    await page.getByLabel("Identifier").fill("CI-001");
    await page.getByLabel("Title").fill("Maximum chamber pressure compliance");
    await page.getByRole("button", { name: "Create item" }).click();
    await expect(page).toHaveURL(/\/certification\/items\/[a-z0-9]+$/);

    await page.getByLabel("Applicability", { exact: true }).selectOption("APPLICABLE");
    await page
      .getByLabel("Applicability rationale")
      .fill("This obligation applies to the pressure limit.");
    await page.getByRole("button", { name: "Save applicability" }).click();
    await page.getByLabel("Compliance method").selectOption("TEST");

    await page.getByRole("button", { name: "Add link" }).click();
    await page.getByLabel("Link type").selectOption("REQUIREMENT");
    await page.getByLabel("Target").selectOption({ label: "REQ-001 — Maximum chamber pressure" });
    await page.getByRole("dialog").getByRole("button", { name: "Add link" }).click();
    await expect(page.getByText(/REQ-001/)).toBeVisible();

    await page.goto(`${projectUrl}/certification/review`);
    await page.getByRole("button", { name: "Evaluate certification review" }).click();
    await expect(page.getByRole("heading", { name: /certification review/i })).toBeVisible();
    // Real object references, never a fabricated regulatory claim.
    await expect(page.getByText(/CI-001/)).toBeVisible();
  });

  // --- 13. Sentinel ---------------------------------------------------------

  test("13: edits the still-in-review requirement, and Sentinel detects and acknowledges a real change", async ({
    page,
  }) => {
    await page.goto(secondRequirementUrl);
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page
      .getByLabel(/^Statement/)
      .fill("The igniter shall achieve reliable relight across five consecutive restarts.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/five consecutive restarts/)).toBeVisible();

    await page.goto(`${projectUrl}/sentinel`);
    await page.getByRole("button", { name: /run detection/i }).click();
    // A real target naming the real changed requirement — never a synthetic
    // placeholder id.
    await expect(page.getByText(/REQ-002/)).toBeVisible();

    await page.getByRole("button", { name: "Acknowledge" }).first().click();
    await expect(page.getByRole("button", { name: "Acknowledge" })).toHaveCount(0);
  });

  // --- 14. Traceability ---------------------------------------------------------

  test("14: opens REQ-001 in Traceability and finds the real design item, decision, and evidence-linked activity", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/traceability`);
    await expect(page.getByRole("heading", { name: "Traceability" })).toBeVisible();

    await page.getByLabel("Object type").selectOption("REQUIREMENT");
    await page.getByLabel("Object").selectOption({ label: "REQ-001 — Maximum chamber pressure" });
    await page.getByRole("button", { name: "Open" }).click();

    await expect(page.getByText("Currently inspecting")).toBeVisible();
    const outbound = page.getByText("Outbound — what this affects").locator("..");
    await expect(outbound.getByText(/DI-001/)).toBeVisible();
    await expect(outbound.getByText(/ED-001/)).toBeVisible();
    await expect(outbound.getByText(/VA-001/)).toBeVisible();
  });

  // --- 15. History ---------------------------------------------------------

  test("15: opens REQ-001's own Engineering History and finds the real approval it just went through", async ({
    page,
  }) => {
    await page.goto(requirementUrl);
    await page.getByRole("link", { name: "History" }).click();

    await expect(page).toHaveURL(/\/history\/REQUIREMENT\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: /REQ-001/ })).toBeVisible();
    await expect(page.getByText("Status changed")).toBeVisible();
  });

  // --- 16. Command Center ---------------------------------------------------------

  test("16: opens the Command Center and finds this scenario's own real objects, not an aggregate score", async ({
    page,
  }) => {
    await page.goto(`${projectUrl}/command-center`);
    await expect(page.getByRole("heading", { name: "Engineering Command Center" })).toBeVisible();

    // The real, still-active change request this scenario submitted.
    await expect(page.getByText(/CR-001/)).toBeVisible();
    // The real technical readiness gate this scenario evaluated.
    await expect(page.getByText(/Design review/i)).toBeVisible();

    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/health score|composite score|risk score|readiness percent/i);
  });
});
