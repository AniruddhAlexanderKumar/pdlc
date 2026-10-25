/**
 * Dashboard layouts.
 *
 * A layout is plain data: an ordered list of widgets, each with a width on a 12-column grid.
 * Presets are named layouts. A user stores either a preset id (so preset improvements reach
 * them) or, later, their own `items`. The server and the web app both go through
 * `resolveLayout`, so adding fully custom layouts means accepting `items` in the API and
 * building an editor; nothing here has to change shape.
 */

export type DashboardSpan = 3 | 4 | 6 | 8 | 12;

export const WIDGETS = {
  'stat-products': { title: 'Products in flight', spans: [3, 4, 6] },
  'stat-health': { title: 'Average health', spans: [3, 4, 6] },
  'stat-margin': { title: 'Average margin', spans: [3, 4, 6] },
  'stat-week': { title: 'Your week', spans: [3, 4, 6] },
  'next-moves': { title: 'Next best moves', spans: [6, 8, 12] },
  'xp-progress': { title: 'Level progress', spans: [4, 6, 12] },
  'recent-xp': { title: 'Recent XP', spans: [4, 6, 12] },
  'margin-ranking': { title: 'Margin by product', spans: [6, 12] },
  'health-ranking': { title: 'Health by product', spans: [6, 12] },
  board: { title: 'Lifecycle board', spans: [12] },
  list: { title: 'Product table', spans: [12] }
} as const satisfies Record<string, { title: string; spans: readonly DashboardSpan[] }>;

export type WidgetId = keyof typeof WIDGETS;

export interface LayoutItem {
  widget: WidgetId;
  /** Columns taken on the 12-column grid. */
  span: DashboardSpan;
}

export interface DashboardLayout {
  /** The preset this layout came from, or null for a custom layout. */
  preset: PresetId | null;
  items: LayoutItem[];
}

/** What is saved for a user. `items` is only used when `preset` is null (custom layouts). */
export interface DashboardSettings {
  preset: PresetId | null;
  items?: LayoutItem[];
}

const item = (widget: WidgetId, span: DashboardSpan): LayoutItem => ({ widget, span });

export const PRESETS = {
  overview: {
    label: 'Overview',
    blurb: 'Stats, next moves and the full lifecycle board.',
    items: [item('stat-products', 3), item('stat-health', 3), item('stat-margin', 3), item('stat-week', 3), item('next-moves', 12), item('board', 12)]
  },
  focus: {
    label: 'Focus',
    blurb: 'Just what to do next, with your progress alongside.',
    items: [item('next-moves', 8), item('xp-progress', 4), item('stat-products', 4), item('stat-health', 4), item('stat-week', 4)]
  },
  pipeline: {
    label: 'Pipeline',
    blurb: 'A big board for moving products through the stages.',
    items: [item('stat-products', 4), item('stat-health', 4), item('stat-week', 4), item('board', 12), item('next-moves', 12)]
  },
  finance: {
    label: 'Finance',
    blurb: 'Margins and costs first, with the product table.',
    items: [item('stat-margin', 4), item('stat-products', 4), item('stat-health', 4), item('margin-ranking', 6), item('health-ranking', 6), item('list', 12)]
  },
  momentum: {
    label: 'Momentum',
    blurb: 'Levels, streaks and recent XP to keep you going.',
    items: [item('xp-progress', 6), item('recent-xp', 6), item('stat-week', 4), item('stat-products', 4), item('stat-health', 4), item('next-moves', 12)]
  }
} as const satisfies Record<string, { label: string; blurb: string; items: readonly LayoutItem[] }>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as [PresetId, ...PresetId[]];
export const DEFAULT_PRESET: PresetId = 'overview';

export const isPresetId = (v: unknown): v is PresetId => typeof v === 'string' && Object.hasOwn(PRESETS, v);
const isWidgetId = (v: unknown): v is WidgetId => typeof v === 'string' && Object.hasOwn(WIDGETS, v);

/** Keeps known widgets only, once each, with a span the widget supports. */
export function sanitizeItems(raw: unknown): LayoutItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<WidgetId>();
  const out: LayoutItem[] = [];
  for (const r of raw) {
    const widget = (r as { widget?: unknown } | null)?.widget;
    if (!isWidgetId(widget) || seen.has(widget)) continue;
    const spans: readonly DashboardSpan[] = WIDGETS[widget].spans;
    const span = (r as { span?: unknown }).span;
    seen.add(widget);
    out.push({ widget, span: spans.find((s) => s === span) ?? spans[spans.length - 1] });
  }
  return out;
}

/** Turns whatever is stored (possibly null, stale or malformed) into a layout that can render. */
export function resolveLayout(stored: unknown): DashboardLayout {
  const s = (stored ?? {}) as Partial<DashboardSettings>;
  if (isPresetId(s.preset)) return { preset: s.preset, items: PRESETS[s.preset].items.map((i) => ({ ...i })) };
  if (s.preset === null) {
    const items = sanitizeItems(s.items);
    if (items.length > 0) return { preset: null, items };
  }
  return { preset: DEFAULT_PRESET, items: PRESETS[DEFAULT_PRESET].items.map((i) => ({ ...i })) };
}
