import type { Sketch } from './sketch.js';
import { extrudeSketch } from './kernel/extrude.js';
import { tessellatePlanar } from './kernel/tessellation.js';
import { cross3, normalize3, sub3, type Vec2, type Vec3 } from './math.js';

/** Extrude a closed profile from millimetre dimensions and write a binary STL in millimetres. */
export function makeModelStl({ profile, width, depth, height }: {
  profile: 'rectangle' | 'circle' | 'triangle'; width: number; depth: number; height: number;
}): ArrayBuffer {
  if (![width, depth, height].every(value => Number.isFinite(value) && value >= 0.1 && value <= 2000)) {
    throw new Error('Enter dimensions from 0.1 to 2000 mm.');
  }
  if (profile === 'circle') return writeStl(cylinder(width / 2000, height / 1000));
  const w = width / 1000;
  const d = depth / 1000;
  const points: Vec2[] = profile === 'triangle'
    ? [[0, 0], [w, 0], [w / 2, d]]
    : [[0, 0], [w, 0], [w, d], [0, d]];

  const sketch: Sketch = {
    id: 'model-profile', schemaVersion: 1, plane: 'XY', units: 'm', revision: 0, constraints: [],
    entities: points.map((start, index) => ({
      type: 'line', id: `edge-${index}`, start, end: points[(index + 1) % points.length],
      ownerId: 'model', createdAt: '2000-01-01T00:00:00.000Z', construction: false, visible: true
    }))
  };
  const result = extrudeSketch({ sketch, operationId: 'model', distanceMetres: height / 1000, mode: 'blind' });
  if (!result.ok) throw new Error(result.diagnostics[0].message);
  const mesh = tessellatePlanar(result.value.solid);
  if (!mesh.ok) throw new Error(mesh.diagnostics[0].message);

  return writeStl(mesh.value.triangles);
}

type Triangle = { normal: Vec3; points: readonly [Vec3, Vec3, Vec3] };

function cylinder(radius: number, height: number): Triangle[] {
  const facets = 64;
  const ring = Array.from({ length: facets }, (_, index) => {
    const angle = index * 2 * Math.PI / facets;
    return [radius * Math.cos(angle), radius * Math.sin(angle)] as const;
  });
  function triangle(a: Vec3, b: Vec3, c: Vec3): Triangle {
    return { points: [a, b, c], normal: normalize3(cross3(sub3(b, a), sub3(c, a))) };
  }
  return ring.flatMap(([x, y], index) => {
    const [nextX, nextY] = ring[(index + 1) % facets];
    const a: Vec3 = [x, y, 0], b: Vec3 = [nextX, nextY, 0];
    const c: Vec3 = [nextX, nextY, height], d: Vec3 = [x, y, height];
    return [
      triangle(a, b, c), triangle(a, c, d),
      triangle([0, 0, 0], b, a), triangle([0, 0, height], d, c)
    ];
  });
}

function writeStl(triangles: Triangle[]): ArrayBuffer {
  const bytes = new ArrayBuffer(84 + 50 * triangles.length);
  const output = new DataView(bytes);
  output.setUint32(80, triangles.length, true);
  triangles.forEach(({ normal, points }, index) => {
    const start = 84 + index * 50;
    normal.forEach((value, axis) => output.setFloat32(start + axis * 4, value, true));
    points.forEach((point, vertex) => point.forEach((value, axis) => {
      output.setFloat32(start + 12 + vertex * 12 + axis * 4, value * 1000, true);
    }));
  });
  return bytes;
}
