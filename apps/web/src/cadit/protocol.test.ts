import test from "node:test";
import assert from "node:assert/strict";
import {
  CADIT_INIT,
  CADIT_ORIGIN,
  CADIT_URL,
  readCaditMessage,
} from "./protocol";

const expected = {} as Window;
const event = (
  data: unknown,
  origin = CADIT_ORIGIN,
  source: Window | null = expected,
) => ({ data, origin, source });

test("CADit protocol requires the exact origin and expected iframe window", () => {
  assert.deepEqual(readCaditMessage(event({ type: "ready" }), expected), {
    type: "ready",
  });
  assert.equal(
    readCaditMessage(
      event({ type: "ready" }, "https://app.cadit.app.evil.test"),
      expected,
    ),
    null,
  );
  assert.equal(
    readCaditMessage(
      event({ type: "ready" }, CADIT_ORIGIN, {} as Window),
      expected,
    ),
    null,
  );
  assert.equal(
    readCaditMessage(event({ type: "ready" }, CADIT_ORIGIN, null), null),
    null,
  );
  assert.equal(readCaditMessage(event(null), expected), null);
  assert.equal(readCaditMessage(event({ type: "unknown" }), expected), null);
  assert.equal(
    CADIT_URL,
    "https://app.cadit.app/new?embed=true&partnerName=Solution%20Velocity",
  );
  assert.deepEqual(CADIT_INIT, {
    type: "init",
    payload: { partnerName: "Solution Velocity", features: ["export"] },
  });
});

test("STL export validates the blob and safely normalizes the filename", () => {
  const blob = new Blob(["solid fixture"], { type: "model/stl" });
  assert.deepEqual(
    readCaditMessage(
      event({
        type: "export-stl",
        payload: { blob, filename: "../fixture.stl" },
      }),
      expected,
    ),
    { type: "export-stl", blob, filename: "fixture.stl" },
  );
  assert.deepEqual(
    readCaditMessage(
      event({ type: "export-stl", payload: { blob, filename: "C:\\design" } }),
      expected,
    ),
    { type: "export-stl", blob, filename: "design.stl" },
  );
  for (const payload of [
    null,
    {},
    { blob: new Blob([]), filename: "x.stl" },
    { blob: "text", filename: "x.stl" },
    { blob, filename: 123 },
  ]) {
    assert.deepEqual(
      readCaditMessage(event({ type: "export-stl", payload }), expected),
      { type: "invalid-export" },
    );
  }
});
