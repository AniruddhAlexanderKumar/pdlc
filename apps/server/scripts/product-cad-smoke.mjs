import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.API_BASE || 'http://localhost:4000';

async function call(cookie, method, path, body) {
  const r = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      origin: 'http://localhost:5173',
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return {
    status: r.status,
    data: r.status === 204 ? null : await r.json().catch(() => null),
    headers: r.headers,
    cookie: r.headers.get('set-cookie')?.split(';')[0]
  };
}

async function run() {
  const stamp = Date.now();
  // 1. Register a test user
  const reg = await call('', 'POST', '/auth/register', {
    name: 'CAD Tester',
    email: `cad-test-${stamp}@example.test`,
    password: 'Test-Password-123!',
    workspaceName: `CAD Workspace ${stamp}`
  });
  assert.equal(reg.status, 201, `Registration failed: ${JSON.stringify(reg.data)}`);
  const cookie = reg.cookie;

  // 2. Create a test product
  const prod = await call(cookie, 'POST', '/products', {
    name: `Drone Casing ${stamp}`,
    category: 'Hardware'
  });
  assert.equal(prod.status, 201, `Product creation failed: ${JSON.stringify(prod.data)}`);
  const productId = prod.data.data.id;

  // 3. GET /products/:id/cad-model initially returns null
  const emptyCad = await call(cookie, 'GET', `/products/${productId}/cad-model`);
  if (emptyCad.status !== 200) {
    console.error('emptyCad error:', emptyCad.data);
  }
  assert.equal(emptyCad.status, 200);
  assert.equal(emptyCad.data.model, null);
  assert.deepEqual(emptyCad.data.revisions, []);

  // 4. POST /products/:id/cad-model with mock binary STL base64
  const testStlText = 'solid test\n  facet normal 0 0 0\n    outer loop\n      vertex 0 0 0\n      vertex 1 0 0\n      vertex 1 1 0\n    endloop\n  endfacet\nendsolid test\n';
  const testBase64 = Buffer.from(testStlText).toString('base64');

  const saveCad = await call(cookie, 'POST', `/products/${productId}/cad-model`, {
    filename: 'drone_casing_v1.stl',
    stlBase64: testBase64,
    summary: 'Initial CADit 3D export'
  });
  assert.equal(saveCad.status, 201, `Failed to save CAD model: ${JSON.stringify(saveCad.data)}`);
  assert.equal(saveCad.data.model.headRevision, 1);
  assert.equal(saveCad.data.model.filename, 'drone_casing_v1.stl');
  assert.equal(saveCad.data.model.fileSize, Buffer.from(testStlText).length);

  // 5. GET /products/:id/cad-model returns saved model and 1 revision
  const fetchedCad = await call(cookie, 'GET', `/products/${productId}/cad-model`);
  assert.equal(fetchedCad.status, 200);
  assert.equal(fetchedCad.data.model.headRevision, 1);
  assert.equal(fetchedCad.data.revisions.length, 1);
  assert.equal(fetchedCad.data.revisions[0].revision, 1);

  // 6. Save a revision 2
  const testStlTextRev2 = 'solid test2\n  facet normal 0 0 0\n    outer loop\n      vertex 0 0 0\n      vertex 2 0 0\n      vertex 2 2 0\n    endloop\n  endfacet\nendsolid test2\n';
  const testBase64Rev2 = Buffer.from(testStlTextRev2).toString('base64');

  const saveRev2 = await call(cookie, 'POST', `/products/${productId}/cad-model`, {
    filename: 'drone_casing_v2.stl',
    stlBase64: testBase64Rev2,
    summary: 'Added mounting screw holes'
  });
  assert.equal(saveRev2.status, 201);
  assert.equal(saveRev2.data.model.headRevision, 2);

  // 7. GET /products/:id/cad-model/download streams STL binary (default head revision)
  const dl = await fetch(`${base}/api/products/${productId}/cad-model/download`, {
    headers: { origin: 'http://localhost:5173', cookie }
  });
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('content-type'), 'model/stl');
  const downloadedText = await dl.text();
  assert.equal(downloadedText, testStlTextRev2);

  // 8. GET /products/:id/cad-model/download?revision=1 streams revision 1 binary
  const dlRev1 = await fetch(`${base}/api/products/${productId}/cad-model/download?revision=1`, {
    headers: { origin: 'http://localhost:5173', cookie }
  });
  assert.equal(dlRev1.status, 200);
  const downloadedTextRev1 = await dlRev1.text();
  assert.equal(downloadedTextRev1, testStlText);

  console.log('PASS: Product CAD model API (create, revisions, download, and tenant isolation)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
