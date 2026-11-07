import type { APIRequestContext, Page } from "@playwright/test";

/**
 * Shared end-to-end helpers.
 *
 * Anything that reads or writes application data needs PostgreSQL. Those
 * tests are skipped by name when it is unreachable rather than faked into
 * passing — see the specs that use {@link databaseAvailable}.
 */

/** /api/health performs a real `SELECT 1`, so it is the honest probe. */
export async function databaseAvailable(request: APIRequestContext): Promise<boolean> {
  const response = await request.get("/api/health");
  return response.ok();
}

export interface E2EAccount {
  email: string;
  password: string;
  organizationName: string;
}

/**
 * Registers a fresh account through the real sign-up form and waits for the
 * authenticated dashboard.
 *
 * Each run uses a unique "[E2E]" organization and address so tests never
 * collide with each other or with seeded development data.
 */
export async function signUpNewAccount(page: Page, label: string): Promise<E2EAccount> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const account: E2EAccount = {
    email: `e2e-${label}-${stamp}@example.test`,
    password: "e2e correct horse battery staple",
    organizationName: `[E2E] ${label} ${stamp}`,
  };

  await page.goto("/sign-up");
  await page.getByLabel("Organization name").fill(account.organizationName);
  await page.getByLabel("Your name").fill("E2E Engineer");
  await page.getByLabel("Work email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL(/\/dashboard$/);
  return account;
}

export async function signIn(page: Page, account: E2EAccount): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard$/);
}

/** Signs out through the account menu behind the avatar in the top bar. */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("button", { name: /sign out/i }).click();
}

/**
 * Gives the record being created a specific number. Create forms number
 * records automatically unless asked otherwise ("Use my own number"), and
 * these specs refer back to records by the numbers they chose.
 */
export async function fillRecordNumber(page: Page, identifier: string): Promise<void> {
  await page.getByRole("button", { name: "Use my own number" }).click();
  await page.getByLabel("Number", { exact: true }).fill(identifier);
}
