/**
 * Dashboard layouts.
 *
 * A layout is plain data: an ordered list of widgets, each with a width on a 12-column grid.
 * Presets are named layouts. An account can follow a preset or store a customized
 * ordered list of visible items. The server and the web app both use `resolveLayout`;
 * existing preset ids and legacy custom layouts remain supported.
 */

export type DashboardSpan = 3 | 4 | 6 | 8 | 12;

export const WIDGETS = {
  'stat-products': { title: 'Products in flight', spans: [3, 4, 6] },
  'stat-health': { title: 'Average product health', spans: [3, 4, 6] },
  'stat-margin': { title: 'Average margin', spans: [3, 4, 6] },
  'stat-week': { title: 'Your week', spans: [3, 4, 6] },
  'next-moves': { title: 'Next best moves', spans: [6, 8, 12] },
  'xp-progress': { title: 'Level progress', spans: [4, 6, 12] },
  'recent-xp': { title: 'Recent XP', spans: [4, 6, 12] },
  'margin-ranking': { title: 'Margin by product', spans: [6, 12] },
  'health-ranking': { title: 'Health by product', spans: [6, 12] },
  board: { title: 'Lifecycle board', spans: [12] },
  list: { title: 'Product table', spans: [12] },
  'task-deadlines': { title: 'Product task deadlines', spans: [6, 12] },
  'project-summary': { title: 'Project overview', spans: [4, 6, 12] },
  'issue-progress': { title: 'Issue completion', spans: [4, 6, 12] },
  'priority-issues': { title: 'High-priority issues', spans: [6, 12] },
  'assigned-issues': { title: 'My assigned issues', spans: [6, 12] },
  'recent-issues': { title: 'Recently updated issues', spans: [6, 12] },
  'project-list': { title: 'Projects', spans: [6, 12] },
  'team-workload': { title: 'Team workload', spans: [6, 12] },
  'dependencies': { title: 'Open dependencies', spans: [6, 12] }
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
  density?: 'compact' | 'expanded';
  updatedAt?: string;
  isDefault?: boolean;
}

/** What is saved for a user. Items override the preset arrangement when present. */
export interface DashboardSettings {
  preset: PresetId | null;
  items?: LayoutItem[];
  density?: 'compact' | 'expanded';
  updatedAt?: string;
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
  executive: {
    label: 'Executive Overview', blurb: 'A high-level view of projects, issue progress and team workload.',
    items: [item('project-summary', 4), item('issue-progress', 4), item('stat-health', 4), item('priority-issues', 6), item('team-workload', 6), item('recent-issues', 6), item('project-list', 6), item('dependencies', 12)]
  },
  manager: {
    label: 'Project Manager', blurb: 'Track execution, open issues and dependencies across projects.',
    items: [item('project-summary', 6), item('issue-progress', 6), item('priority-issues', 6), item('team-workload', 6), item('dependencies', 6), item('recent-issues', 6), item('task-deadlines', 6), item('project-list', 6)]
  },
  engineering: {
    label: 'Engineering Workspace', blurb: 'Keep assigned issues, dependencies and product work in view.',
    items: [item('assigned-issues', 6), item('dependencies', 6), item('priority-issues', 6), item('recent-issues', 6), item('board', 12)]
  },
  quality: {
    label: 'QA & Verification', blurb: 'Review high-priority issues and recent project changes.',
    items: [item('issue-progress', 6), item('project-summary', 6), item('priority-issues', 6), item('recent-issues', 6), item('dependencies', 12)]
  },
  personal: {
    label: 'Personal Productivity', blurb: 'Focus on your assigned issues and product next steps.',
    items: [item('assigned-issues', 6), item('next-moves', 6), item('recent-issues', 6), item('project-list', 6), item('task-deadlines', 12)]
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
export const TEMPLATE_IDS = ['executive', 'manager', 'engineering', 'quality', 'personal'] as const satisfies readonly PresetId[];
export const TEMPLATE_DETAILS: Record<(typeof TEMPLATE_IDS)[number], { audience: string; unavailable: string }> = {
  executive: { audience: 'Leadership', unavailable: 'Milestones, project deadlines, risks and performance trends are not tracked in this workspace.' },
  manager: { audience: 'Project management', unavailable: 'Sprints, milestones and project deadlines are not tracked in this workspace.' },
  engineering: { audience: 'Engineering', unavailable: 'Requirements, engineering changes, decisions, evidence and technical reviews are not tracked in this workspace.' },
  quality: { audience: 'Quality assurance', unavailable: 'Verification, tests, evidence, non-conformities and review records are not tracked in this workspace.' },
  personal: { audience: 'Individual workspace', unavailable: 'Issue deadlines and review states are not tracked in this workspace.' }
};
/** Catalog metadata describes the real source and authorization scope of each reusable widget. */
export const WIDGET_DEFINITIONS = Object.fromEntries((Object.keys(WIDGETS) as WidgetId[]).map((id) => {
  const personal = ['assigned-issues', 'stat-week', 'xp-progress', 'recent-xp'].includes(id);
  const projects = ['project-summary', 'issue-progress', 'priority-issues', 'recent-issues', 'project-list', 'team-workload', 'dependencies'].includes(id);
  return [id, {
    id,
    type: id,
    title: WIDGETS[id].title,
    widths: WIDGETS[id].spans as readonly DashboardSpan[],
    dataSource: projects || id === 'assigned-issues' ? 'project issues' as const : personal ? 'personal activity' as const : 'workspace products' as const,
    filters: id === 'assigned-issues' ? ['current user', 'open'] : id === 'priority-issues' ? ['high or critical', 'open'] : id === 'dependencies' ? ['unfinished dependencies'] : [],
    permissions: 'workspace member' as const
  }];
})) as Record<WidgetId, { id: WidgetId; type: WidgetId; title: string; widths: readonly DashboardSpan[]; dataSource: 'project issues' | 'personal activity' | 'workspace products'; filters: string[]; permissions: 'workspace member' }>;
export const widgetSource = (id: WidgetId) => WIDGET_DEFINITIONS[id].dataSource;

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
  const metadata = {
    density: s.density === 'compact' ? 'compact' as const : 'expanded' as const,
    ...(typeof s.updatedAt === 'string' && !Number.isNaN(Date.parse(s.updatedAt)) ? { updatedAt: s.updatedAt } : {}),
    isDefault: stored == null
  };
  if (isPresetId(s.preset)) {
    const items = Array.isArray(s.items) ? sanitizeItems(s.items) : null;
    return { preset: s.preset, items: items ?? PRESETS[s.preset].items.map((i) => ({ ...i })), ...metadata };
  }
  if (s.preset === null) {
    const items = sanitizeItems(s.items);
    if (items.length > 0) return { preset: null, items, ...metadata };
  }
  return { preset: DEFAULT_PRESET, items: PRESETS[DEFAULT_PRESET].items.map((i) => ({ ...i })), ...metadata };
}
