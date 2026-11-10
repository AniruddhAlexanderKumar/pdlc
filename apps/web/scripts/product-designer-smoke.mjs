// Standalone UI fixture: no production requests, credentials, or database.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
if (process.env.DESIGNER_TEST_URL !== "http://localhost:4173")
  throw Error("Requires isolated local test at localhost:4173");
const { chromium: pw } = await import(process.env.STUDIO_PLAYWRIGHT_MODULE);
const { default: chromium } = await import(process.env.STUDIO_CHROMIUM_MODULE);
const browser = await pw.launch({
  executablePath: await chromium.executablePath(),
  args: chromium.args.filter((a) => a !== "--disable-web-security"),
  headless: true,
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto(
    "http://localhost:4173/product-designer.html?projectId=initial-project&projectName=Initial%20Project",
  );
  assert.equal(response.status(), 200);
  assert(!response.headers()["x-frame-options"]);
  assert.match(
    response.headers()["content-security-policy"],
    /frame-ancestors \*/,
  );
  await page.getByRole("heading", { name: "Make your mark." }).waitFor();
  assert.equal(
    await page.getByLabel("Project reference").inputValue(),
    "initial-project",
  );
  assert.equal(
    await page.getByLabel("Project name").inputValue(),
    "Initial Project",
  );
  await page.getByRole("button", { name: "Mug" }).click();
  await page.getByLabel("Material").selectOption("Enamel");
  await page.getByLabel("Custom base color").fill("#b47354");
  await page.getByLabel("Project name").fill("Example project");
  await page.getByLabel("Project reference").fill("P-12");
  await page.getByRole("tab", { name: "Text" }).click();
  await page.getByRole("button", { name: "Add text layer" }).click();
  await page.getByRole("textbox", { name: "Your text" }).fill("HELLO");
  await page.getByLabel("Font family").selectOption("Georgia");
  await page.getByLabel("Text size").fill("32");
  await page.getByRole("button", { name: "Italic" }).click();
  const canvas = page.getByLabel("Product design canvas");
  const layer = canvas.locator('g[aria-label="HELLO"]');
  const coords = await layer.boundingBox();
  await page.mouse.move(
    coords.x + coords.width / 2,
    coords.y + coords.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    coords.x + coords.width / 2 + 28,
    coords.y + coords.height / 2 + 22,
    { steps: 4 },
  );
  await page.mouse.up();
  assert.notEqual(
    Number(await page.getByLabel("X", { exact: true }).inputValue()),
    237,
  );
  const selected = canvas.locator(
    'g[data-editor-only] rect[style*="nwse-resize"]',
  );
  const handle = await selected.boundingBox();
  const w = Number(
    await page.getByLabel("Width", { exact: true }).inputValue(),
  );
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2 + 20,
    handle.y + handle.height / 2 + 10,
    { steps: 3 },
  );
  await page.mouse.up();
  assert(
    Number(await page.getByLabel("Width", { exact: true }).inputValue()) > w,
  );
  await page.getByRole("tab", { name: "Graphics" }).click();
  await page.getByRole("button", { name: "Add star sticker" }).click();
  await page.getByLabel("Sticker color").fill("#aa6633");
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .locator('input[accept="image/png,image/jpeg,image/webp"]')
    .setInputFiles({
      name: "fixture.png",
      mimeType: "image/png",
      buffer: tinyPng,
    });
  await page.getByRole("button", { name: /fixture.png/ }).waitFor();
  await page.getByRole("button", { name: "Export specs" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByText("P-12", { exact: true }).waitFor();
  await modal.getByText("Enamel", { exact: true }).waitFor();
  await modal.getByText("#B47354", { exact: true }).waitFor();
  await modal.getByText(/Georgia · 32 px/).waitFor();
  assert.equal(await modal.locator("li").count(), 3);
  await modal.getByRole("button", { name: "Close", exact: true }).click();
  let event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  let download = await event;
  const contents = await readFile(await download.path());
  const saved = JSON.parse(contents);
  assert.equal(saved.projectId, "P-12");
  assert.equal(saved.layers.length, 3);
  assert.equal(saved.layers[2].type, "image");
  event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  download = await event;
  const png = await readFile(await download.path());
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 1200);
  const pixel = await page.evaluate(async (base64) => {
    const i = new Image();
    i.src = `data:image/png;base64,${base64}`;
    await i.decode();
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 1200;
    const ctx = c.getContext("2d");
    ctx.drawImage(i, 0, 0);
    return Array.from(ctx.getImageData(574, 646, 1, 1).data);
  }, png.toString("base64"));
  assert(
    pixel[0] < 20 && pixel[1] < 20 && pixel[2] < 20,
    "uploaded image is present in PNG",
  );
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reset canvas" }).click();
  await page.getByText("A fresh canvas").waitFor();
  page.once("dialog", (d) => d.accept());
  await page
    .locator('input[accept="application/json,.json"]')
    .setInputFiles({
      name: "project.json",
      mimeType: "application/json",
      buffer: contents,
    });
  await page.getByText("Project opened on this device.").waitFor();
  assert.equal(
    await page.getByRole("button", { name: /fixture.png/ }).count(),
    1,
  );
  await page
    .getByRole("button", { name: "star sticker Shape", exact: true })
    .click();
  await page.getByRole("button", { name: "Move layer forward" }).click();
  await page.getByRole("button", { name: "Delete selected layer" }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "star sticker Shape", exact: true })
      .count(),
    0,
  );
  await page
    .locator('input[accept="image/png,image/jpeg,image/webp"]')
    .setInputFiles({
      name: "bad.png",
      mimeType: "image/png",
      buffer: Buffer.from('<svg onload="x"></svg>'),
    });
  await page
    .getByRole("alert")
    .getByText(/Choose a PNG/)
    .waitFor();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const size = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert(size.scroll <= size.width, JSON.stringify(size));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  if (process.env.DESIGNER_SCREENSHOT)
    await page.screenshot({
      path: process.env.DESIGNER_SCREENSHOT,
      fullPage: true,
    });
  const iframePage = await browser.newPage();
  await iframePage.goto("http://127.0.0.1:4174");
  await iframePage
    .frameLocator("iframe")
    .getByRole("heading", { name: "Make your mark." })
    .waitFor({ timeout: 10000 });
  const ordinary = await fetch("http://localhost:4173/login");
  assert.match(
    ordinary.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert(ordinary.headers.has("x-frame-options"));
  assert.deepEqual(errors, []);
  console.log(
    "PASS product design, direct drag/resize, uploads, specs, JSON recovery, PNG, mobile and cross-origin iframe",
  );
} finally {
  await browser.close();
}
