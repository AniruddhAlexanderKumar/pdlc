import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_FOCUS, NAV_FOCUS_PATHS, suggestWorkspaceNavigation, isProjectFocusedDefault } from './workspace-profile.js';

describe('workspace setup recommendations', () => {
  it('suggests only existing navigation for software and never infers materials', () => {
    assert.deepEqual(suggestWorkspaceNavigation(['software'], []), ['projects']);
    assert.deepEqual(suggestWorkspaceNavigation(['software'], ['collaboration', 'ai']), ['projects', 'teamwork', 'assistant']);
  });
  it('supports mixed domains and does not create unsupported items or duplicates', () => {
    const result = suggestWorkspaceNavigation(['software', 'aerospace'], ['materials', 'products']);
    assert.deepEqual(result, ['projects', 'products', 'materials', 'suppliers']);
    assert.equal(new Set(result).size, result.length);
    for (const id of result) { assert.ok(NAV_FOCUS.includes(id)); assert.ok(NAV_FOCUS_PATHS[id].startsWith('/')); }
  });
  it('only adapts an unsaved default, never a saved personal layout or product-focused workspace', () => {
    const software = { domains: ['software'] as const, objective: '', requirements: [] as const, navigation: [] as const };
    const profile = { ...software, domains: [...software.domains], requirements: [...software.requirements], navigation: [...software.navigation] };
    assert.equal(isProjectFocusedDefault(profile, true), true);
    assert.equal(isProjectFocusedDefault(profile, false), false);
    assert.equal(isProjectFocusedDefault({ ...profile, domains: ['aerospace'] }, true), false);
    assert.equal(isProjectFocusedDefault({ ...profile, navigation: ['products'] }, true), false);
    assert.equal(isProjectFocusedDefault(null, true), false);
  });
  it('does not invent research modules', () => {
    assert.deepEqual(suggestWorkspaceNavigation(['research'], ['research', 'verification']), ['projects']);
  });
});
