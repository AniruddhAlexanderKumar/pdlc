import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitBounds,
  initialProject,
  MAX_LAYERS,
  parseProject,
  PRINT_AREA,
  sniffImage,
} from "./model";

test("bounds remain inside the print area", () => {
  const base = { id: "test", x: 0, y: 900, width: 500, height: 4 };
  assert.deepEqual(fitBounds(base), {
    id: "test",
    x: PRINT_AREA.x,
    y: PRINT_AREA.y + PRINT_AREA.height - 24,
    width: PRINT_AREA.width,
    height: 24,
  });
});
test("round trip validates supported layers and rejects hostile or malformed imports", () => {
  const project = {
    ...initialProject(),
    projectId: "project-1",
    layers: [
      {
        id: "one",
        type: "text",
        x: 208,
        y: 218,
        width: 80,
        height: 40,
        text: "Hi",
        font: "Arial",
        fontSize: 22,
        bold: false,
        italic: true,
        color: "#ff0000",
      },
    ],
  };
  assert.deepEqual(parseProject(project), project);
  assert.throws(() =>
    parseProject({ ...project, layers: [{ ...project.layers[0], x: 0 }] }),
  );
  assert.throws(() =>
    parseProject({
      ...project,
      layers: [{ ...project.layers[0], font: "url(evil)" }],
    }),
  );
  assert.throws(() =>
    parseProject({
      ...project,
      layers: Array(MAX_LAYERS + 1).fill(project.layers[0]),
    }),
  );
  assert.throws(() =>
    parseProject({
      ...project,
      layers: [{ ...project.layers[0], id: "bad id" }],
    }),
  );
  assert.throws(() =>
    parseProject({
      ...project,
      layers: [
        {
          id: "img",
          type: "image",
          x: 208,
          y: 218,
          width: 80,
          height: 40,
          fileName: "bad.svg",
          dataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
        },
      ],
    }),
  );
  assert.throws(() =>
    parseProject({
      ...project,
      layers: [project.layers[0], project.layers[0]],
    }),
  );
  assert.throws(() => parseProject({ ...project, unknown: true }));
  assert.throws(() =>
    parseProject({
      ...project,
      layers: [{ ...project.layers[0], unknown: true }],
    }),
  );
});
test("image sniff accepts only supported signatures", () => {
  assert.equal(
    sniffImage(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
  assert.equal(sniffImage(Uint8Array.from([255, 216, 255])), "image/jpeg");
  assert.equal(
    sniffImage(new TextEncoder().encode("RIFF0000WEBP")),
    "image/webp",
  );
  assert.equal(sniffImage(new TextEncoder().encode("<svg>")), null);
});
