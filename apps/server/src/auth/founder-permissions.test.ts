import { test } from 'node:test';
import assert from 'node:assert/strict';
import { founderHasPermission, mayChangeFounderRole } from './founder-permissions.js';

test('founder role policy denies unknown roles and permissions by default', () => {
  assert.equal(founderHasPermission('owner', 'founder.roles.manage'), true);
  assert.equal(founderHasPermission('admin', 'founder.roles.manage'), false);
  assert.equal(founderHasPermission('operations', 'founder.security.manage'), false);
  assert.equal(founderHasPermission('operations', 'platform.operations.read'), true);
  assert.equal(founderHasPermission('admin', 'platform.configuration.manage'), true);
  assert.equal(founderHasPermission('owner', 'unknown'), false);
  assert.equal(founderHasPermission('system-admin', 'platform.operations.read'), false);
  assert.equal(founderHasPermission('__proto__', 'platform.operations.read'), false);
});

test('self role changes and admin elevation are denied', () => {
  const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.equal(mayChangeFounderRole(a, 'owner', a.toUpperCase()), false);
  assert.equal(mayChangeFounderRole(a, 'admin', a), false);
  assert.equal(mayChangeFounderRole(a, 'admin', b), false);
  assert.equal(mayChangeFounderRole(a, 'operations', b), false);
  assert.equal(mayChangeFounderRole('not-an-id', 'owner', b), false);
  assert.equal(mayChangeFounderRole(a, 'owner', b), true);
});
