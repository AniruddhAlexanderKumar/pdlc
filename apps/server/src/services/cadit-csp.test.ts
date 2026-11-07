import { test } from "node:test";
import assert from "node:assert/strict";

// createApp does not start migrations. The unreachable synthetic database prevents real access.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/disposable";
const { createApp } = await import("../app.js");

test("CSP permits only CADit and self as frames without relaxing frame ancestry", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("No test address");
    const response = await fetch(`http://127.0.0.1:${addr.port}/api/founders`);
    const csp = response.headers.get("content-security-policy") ?? "";
    assert.match(
      csp,
      /(?:^|;)frame-src 'self' https:\/\/app\.cadit\.app(?:;|$)/,
    );
    assert.match(csp, /(?:^|;)frame-ancestors 'none'(?:;|$)/);
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
