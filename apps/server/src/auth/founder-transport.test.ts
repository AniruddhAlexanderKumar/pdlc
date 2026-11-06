import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import { founderTransportGuard } from './founder-transport.js';

let server: Server;
let base: string;
before(async () => {
  const app = express();
  app.use(founderTransportGuard('https://example.test'));
  app.use((_req, res) => res.status(204).end());
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('No listener');
  base = `http://127.0.0.1:${addr.port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())); });

test('sensitive writes require exact Origin and JSON content type', async () => {
  const request = (headers: Record<string, string>) => fetch(base, { method: 'POST', headers, body: '{}' });
  assert.equal((await request({ 'content-type': 'application/json', origin: 'https://example.test' })).status, 204);
  assert.equal((await request({ 'content-type': 'application/json' })).status, 403);
  assert.equal((await request({ 'content-type': 'application/json', origin: 'https://evil.test' })).status, 403);
  assert.equal((await request({ 'content-type': 'text/plain', origin: 'https://example.test' })).status, 403);
  assert.equal((await request({ 'content-type': 'application/json', origin: 'null' })).status, 403);
  const read = await fetch(base);
  assert.equal(read.status, 204);
  assert.equal(read.headers.get('cache-control'), 'no-store');
  assert.equal(read.headers.get('referrer-policy'), 'no-referrer');
});
