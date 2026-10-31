import assert from 'node:assert/strict';
import { resolveAppLayout, DEFAULT_APP_LAYOUT } from './app-layout.js';
import { describe, it } from 'node:test';
import { DEFAULT_PRESET, PRESET_IDS, PRESETS, resolveLayout, sanitizeItems, TEMPLATE_IDS, WIDGET_DEFINITIONS, WIDGETS } from './dashboard.js';

describe('application layout', () => {
  it('defaults safely and preserves supported preferences', () => {
    for (const value of [undefined, null, {}, 'bad', { navigation: 'bad', contentWidth: 'bad' }]) {
      assert.deepEqual(resolveAppLayout(value), DEFAULT_APP_LAYOUT);
    }
    assert.deepEqual(resolveAppLayout({ navigation: 'compact', contentWidth: 'constrained' }), { navigation: 'compact', contentWidth: 'constrained' });
  });
});

describe('dashboard layouts', () => {
  it('every preset uses known widgets once, with supported spans, and fits whole rows', () => {
    for (const id of PRESET_IDS) {
      const items = PRESETS[id].items;
      assert.equal(new Set(items.map((i) => i.widget)).size, items.length, `${id} repeats a widget`);
      for (const i of items) assert.ok((WIDGETS[i.widget].spans as readonly number[]).includes(i.span), `${id}: ${i.widget} cannot be ${i.span} wide`);
      assert.equal(items.reduce((n, i) => n + i.span, 0) % 12, 0, `${id} leaves a gap in the grid`);
    }
  });

  it('provides five new templates and preserves the five existing presets', () => {
    assert.equal(TEMPLATE_IDS.length, 5);
    assert.equal(PRESET_IDS.length, 10);
  });

  it('has scoped metadata for every widget', () => {
    for (const id of Object.keys(WIDGETS) as (keyof typeof WIDGETS)[]) {
      assert.equal(WIDGET_DEFINITIONS[id].id, id);
      assert.equal(WIDGET_DEFINITIONS[id].permissions, 'workspace member');
      assert.ok(WIDGET_DEFINITIONS[id].dataSource);
      assert.deepEqual(WIDGET_DEFINITIONS[id].widths, WIDGETS[id].spans);
    }
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

  it('retains customized items, empty layouts, density and save time with an active preset', () => {
    const saved = { preset: 'personal', items: [{widget: 'assigned-issues', span: 12}], density: 'compact', updatedAt: '2026-01-01T00:00:00.000Z' };
    const result = resolveLayout(saved);
    assert.equal(result.preset, 'personal');
    assert.deepEqual(result.items, saved.items);
    assert.equal(result.density, 'compact');
    assert.equal(result.updatedAt, saved.updatedAt);
    assert.deepEqual(resolveLayout({preset: 'personal', items: []}).items, []);
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
