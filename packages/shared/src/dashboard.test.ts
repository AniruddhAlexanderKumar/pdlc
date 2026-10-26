import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PRESET, PRESET_IDS, PRESETS, resolveLayout, sanitizeItems, WIDGETS } from './dashboard.js';

describe('dashboard layouts', () => {
  it('every preset uses known widgets once, with supported spans, and fits whole rows', () => {
    for (const id of PRESET_IDS) {
      const items = PRESETS[id].items;
      assert.equal(new Set(items.map((i) => i.widget)).size, items.length, `${id} repeats a widget`);
      for (const i of items) assert.ok((WIDGETS[i.widget].spans as readonly number[]).includes(i.span), `${id}: ${i.widget} cannot be ${i.span} wide`);
      assert.equal(items.reduce((n, i) => n + i.span, 0) % 12, 0, `${id} leaves a gap in the grid`);
    }
  });

  it('there are five presets', () => {
    assert.equal(PRESET_IDS.length, 5);
  });

  it('resolves a stored preset to its current items', () => {
    const layout = resolveLayout({ preset: 'finance' });
    assert.equal(layout.preset, 'finance');
    assert.deepEqual(layout.items, PRESETS.finance.items);
  });

  it('falls back to the default for missing, unknown or malformed settings', () => {
    for (const stored of [null, undefined, {}, 'x', { preset: 'nope' }, { preset: null }, { preset: null, items: [] }, { preset: null, items: [{ widget: 'nope', span: 3 }] }]) {
      const layout = resolveLayout(stored);
      assert.equal(layout.preset, DEFAULT_PRESET);
      assert.deepEqual(layout.items, PRESETS[DEFAULT_PRESET].items);
    }
  });

  it('returns copies so callers cannot mutate a preset', () => {
    resolveLayout({ preset: 'focus' }).items[0].span = 3;
    assert.equal(PRESETS.focus.items[0].span, 8);
  });

  it('keeps custom layouts but drops unknown and duplicate widgets and fixes bad spans', () => {
    const layout = resolveLayout({
      preset: null,
      items: [
        { widget: 'board', span: 3 },
        { widget: 'board', span: 12 },
        { widget: 'gone', span: 6 },
        { widget: 'stat-week', span: 4 }
      ]
    });
    assert.equal(layout.preset, null);
    assert.deepEqual(layout.items, [
      { widget: 'board', span: 12 },
      { widget: 'stat-week', span: 4 }
    ]);
    assert.deepEqual(sanitizeItems('nope'), []);
  });
});
