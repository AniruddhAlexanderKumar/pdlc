import { expect, test } from "@playwright/test";
import { databaseAvailable, signUpNewAccount } from "./helpers";

/**
 * Shell and access-control smoke tests.
 *
 * The unauthenticated cases below need no database — redirecting a signed-out
 * visitor away from the workspace is decided from the request alone.
 */

test.describe("Public surface", () => {
  test("marketing landing page renders with HTTP 200", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("sign-in page is publicly reachable", async ({ page }) => {
    const response = await page.goto("/sign-in");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("sign-up page is publicly reachable", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("heading", { name: /create your organization/i })).toBeVisible();
  });

  test("health API route responds", async ({ request }) => {
    const response = await request.get("/api/health");
    expect([200, 503]).toContain(response.status());
    expect(["ok", "error"]).toContain((await response.json()).status);
  });
});

test.describe("Workspace requires authentication", () => {
  test("an unauthenticated visitor is redirected from the dashboard to sign-in", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("an unauthenticated visitor is redirected from projects to sign-in", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("unauthenticated API requests are rejected with 401", async ({ request }) => {
    const list = await request.get("/api/projects");
    const create = await request.post("/api/projects", { data: { name: "Should not exist" } });

    expect(list.status()).toBe(401);
    expect(create.status()).toBe(401);
    expect((await list.json()).error.code).toBe("UNAUTHORIZED");
  });
});

test.describe("Authenticated workspace shell", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await databaseAvailable(request)), "Requires a reachable PostgreSQL database");
  });

  test("renders sidebar navigation, the signed-in user, and the dashboard", async ({ page }) => {
    const account = await signUpNewAccount(page, "shell");

    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText(account.organizationName)).toBeVisible();
    await expect(page.getByText(account.email)).toBeVisible();
  });

  test("sidebar navigation moves between workspace modules", async ({ page }) => {
    await signUpNewAccount(page, "nav");

    await page.getByRole("link", { name: "Requirements" }).click();
    await expect(page).toHaveURL(/\/requirements$/);
    await expect(page.getByRole("heading", { name: "Requirements" })).toBeVisible();
  });
});
