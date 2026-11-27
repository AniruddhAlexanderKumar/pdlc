// Browser-only synthetic CADit fixture; never talks to CADit or production.
// CADIT_TEST_URL=http://localhost:5173 CHROMIUM_PATH=/usr/bin/chromium node apps/web/scripts/cadit-browser-smoke.mjs
import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
if (process.env.CADIT_TEST_URL !== "http://localhost:5173")
  throw Error("Requires local Vite on localhost:5173");
const { chromium: pw } = await import(process.env.CADIT_PLAYWRIGHT_MODULE ?? 'playwright-core');
const chromium = process.env.CADIT_CHROMIUM_MODULE
  ? (await import(process.env.CADIT_CHROMIUM_MODULE)).default
  : { executablePath: async () => process.env.CHROMIUM_PATH, args: ['--no-sandbox'] };
const browser = await pw.launch({
  executablePath: await chromium.executablePath(),
  args: chromium.args.filter((x) => x !== "--disable-web-security"),
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const workspace = {
    id: "fixture",
    name: "Fixture workspace",
    mode: "solo",
    currency: "USD",
    role: "owner",
  };
  const me = {
    user: {
      id: "fixture",
      name: "Fixture",
      email: "fixture@example.test",
      createdAt: "2026-01-01T00:00:00Z",
    },
    workspace,
    workspaces: [workspace],
  };
  const projectId = '11111111-1111-4111-8111-111111111111';
  const stepId = '22222222-2222-4222-8222-222222222222';
  const records = `/api/journeys/projects/${projectId}/records`;
  let savedFile = null;
  await page.route(/^http:\/\/localhost:5173\/api\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/projects') return route.fulfill({ json: [{ id: projectId, name: 'Fixture product', key: 'FIX' }] });
    if (path === `/api/journeys/projects/${projectId}`) return route.fulfill({
      json: { stages: [{ activities: [{ id: stepId, kind: 'deliverable', title: 'Concept sketches and architecture', artifacts: [] }] }] }
    });
    if (path === records) return route.fulfill({ json: { designs: [], records: [] } });
    if (path === `${records}/files/${stepId}` && route.request().method() === 'POST') {
      savedFile = { name: new URL(route.request().url()).searchParams.get('filename'), bytes: route.request().postDataBuffer().toString() };
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    if (path === "/api/auth/me") return route.fulfill({ json: me });
    if (path === "/api/workspace/data")
      return route.fulfill({
        json: { products: [], materials: [], suppliers: [] },
      });
    return route.fulfill({
      status: 404,
      json: { error: "Fixture unavailable" },
    });
  });
  await page.route("https://app.cadit.app/new?*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><body>CADit fixture<script>
    window.received = [];
    window.addEventListener('message', e => { window.received.push({ origin: e.origin, data: e.data }); if (e.data.type === 'get-stl') parent.postMessage({type:'export-stl',payload:{blob:new Blob(['synthetic stl data']),filename:'../fixture.stl'}}, 'http://localhost:5173'); });
  </script></body></html>`,
    }),
  );
  await page.goto("http://localhost:5173/designs?editor=cadit");
  const consent = page.getByRole("button", { name: "Essential only" });
  if (await consent.isVisible()) await consent.click();
  await page.getByRole("heading", { name: "Design Studio" }).waitFor();
  const iframe = page.locator('iframe[title="CADit 3D design editor"]');
  assert.equal(
    await iframe.getAttribute("src"),
    "https://app.cadit.app/new?embed=true&partnerName=Solution%20Velocity",
  );
  const cadit = page.frame({ url: /app\.cadit\.app\/new/ });
  assert(cadit);
  await cadit.waitForFunction(() => Array.isArray(window.received));
  assert.equal(
    await page.getByRole("button", { name: "Request STL export" }).isDisabled(),
    true,
  );
  assert.equal(await iframe.getAttribute("aria-hidden"), "true");
  assert.equal(await iframe.getAttribute("tabindex"), "-1");
  // A loaded iframe is not proof of readiness: show a failure if no ready message arrives.
  await page.getByText(/CADit did not respond/).waitFor({ timeout: 25000 });
  await page
    .getByRole("heading", { name: "CADit editor unavailable" })
    .waitFor();
  assert.equal(await iframe.getAttribute("aria-hidden"), "true");
  // Wrong origin with expected source and correct origin with wrong source are both ignored.
  await page.evaluate(() => {
    const frame = document.querySelector(
      'iframe[title="CADit 3D design editor"]',
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://evil.test",
        source: frame.contentWindow,
        data: { type: "ready" },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://app.cadit.app",
        source: window,
        data: { type: "ready" },
      }),
    );
  });
  assert.equal(
    await page.getByRole("button", { name: "Request STL export" }).isDisabled(),
    true,
  );
  await cadit.evaluate(() =>
    parent.postMessage(
      { type: "ready", payload: { version: "fixture" } },
      "http://localhost:5173",
    ),
  );
  await page.getByText("CADit ready signal received.").waitFor();
  assert.equal(await iframe.getAttribute("aria-hidden"), "false");
  assert.equal(await iframe.getAttribute("tabindex"), "0");
  assert.equal(
    await page
      .getByRole("heading", { name: "CADit editor unavailable" })
      .count(),
    0,
  );
  await cadit.waitForFunction(() =>
    window.received.some((m) => m.data.type === "init"),
  );
  const init = await cadit.evaluate(() =>
    window.received.find((m) => m.data.type === "init"),
  );
  assert.deepEqual(init, {
    origin: "http://localhost:5173",
    data: {
      type: "init",
      payload: { partnerName: "Solution Velocity", features: ["export"] },
    },
  });
  await page.getByRole("button", { name: "Request STL export" }).click();
  await page.getByText(/STL received: fixture.stl/).waitFor();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download STL" }).click(),
  ]);
  assert.equal(download.suggestedFilename(), "fixture.stl");
  const tmp = "/tmp/cadit-fixture-export.stl";
  await download.saveAs(tmp);
  assert.equal(await readFile(tmp, "utf8"), "synthetic stl data");
  await unlink(tmp);
  await page.getByRole('button', { name: 'Save a version to Journey' }).click();
  await page.getByText('Version saved to Journey.', { exact: true }).waitFor();
  assert.deepEqual(savedFile, { name: 'fixture.stl', bytes: 'synthetic stl data' });
  await cadit.evaluate(() =>
    parent.postMessage(
      {
        type: "export-stl",
        payload: { blob: "not a blob", filename: "bad.stl" },
      },
      "http://localhost:5173",
    ),
  );
  await page.getByText(/invalid or empty STL/).waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Download STL" }).count(),
    0,
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const size = await page.evaluate(() => [
      document.documentElement.clientWidth,
      document.documentElement.scrollWidth,
    ]);
    assert(size[1] <= size[0], String(size));
  }
  await Promise.all([
    page.waitForEvent("dialog").then((dialog) => dialog.dismiss()),
    page.getByRole("link", { name: "Experimental sketches" }).click(),
  ]);
  assert.equal(new URL(page.url()).pathname, "/designs");
  await Promise.all([
    page.waitForEvent("dialog").then((dialog) => dialog.accept()),
    page.getByRole("link", { name: "Experimental sketches" }).click(),
  ]);
  await page.waitForURL(`http://localhost:5173/designs/sketches?project=${projectId}&step=${stepId}`);
  assert.deepEqual(errors, []);
  console.log(
    "PASS synthetic iframe rendering, origin/source checks, init, STL request/download/project save, invalid export, navigation guard and responsive layout",
  );
} finally {
  await browser.close();
}
