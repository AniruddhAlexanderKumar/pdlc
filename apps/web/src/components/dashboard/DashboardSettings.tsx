import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Link } from 'react-router';
import {
  PRESET_IDS,
  PRESETS,
  TEMPLATE_DETAILS,
  TEMPLATE_IDS,
  WIDGETS,
  WIDGET_DEFINITIONS,
  type DashboardLayout,
  type DashboardSettings,
  type DashboardSpan,
  type LayoutItem,
  type PresetId,
  type WidgetId,
} from '@sv/shared';
import { useDashboardLayout, useSaveDashboardLayout, useSession } from '../../api/hooks';
import { Button, Card, Select, Spinner, cx, useConfirm } from '../ui';

type Draft = { preset: PresetId | null; items: LayoutItem[]; density: 'compact' | 'expanded' };
const fromLayout = (layout: DashboardLayout): Draft => ({
  preset: layout.preset,
  items: layout.items.map((i) => ({ ...i })),
  density: layout.density ?? 'expanded',
});
const templateDraft = (id: PresetId): Draft => ({ preset: id, items: PRESETS[id].items.map((i) => ({ ...i })), density: 'expanded' });
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Preview({ items }: { items: readonly LayoutItem[] }) {
  return (
    <div className="grid grid-cols-12 gap-1 rounded-md bg-slate-100 p-2 dark:bg-zinc-800" aria-label="Layout preview">
      {items.map(({ widget, span }) => (
        <div
          key={widget}
          style={{ gridColumn: `span ${span}` }}
          className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white px-1.5 py-2 text-[9px] leading-3 text-slate-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          {WIDGETS[widget].title}
        </div>
      ))}
    </div>
  );
}

export function DashboardSettings() {
  const query = useDashboardLayout();
  if (query.isLoading) return <Spinner label="Loading dashboard settings" />;
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-5 text-sm">
        Could not load dashboard settings.{' '}
        <button className="text-blue-700 underline" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  return <DashboardEditor layout={query.data} />;
}

function DashboardEditor({ layout }: { layout: DashboardLayout }) {
  const me = useSession();
  const confirm = useConfirm();
  const save = useSaveDashboardLayout();
  const [draft, setDraft] = useState<Draft>(() => fromLayout(layout));
  const saved = useMemo(() => fromLayout(layout), [layout]);
  const dirty = !equal(draft, saved);
  const custom = layout.preset === null || !equal(layout.items, PRESETS[layout.preset].items) || layout.density === 'compact';
  useEffect(() => {
    // A background refetch from another device must not discard a local edit.
    if (!dirty) setDraft(fromLayout(layout));
  }, [layout, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const select = async (id: PresetId) => {
    if (id === draft.preset) return;
    const customizedDraft = draft.preset === null || !equal(draft.items, PRESETS[draft.preset].items) || draft.density !== 'expanded';
    if (
      dirty &&
      customizedDraft &&
      !(await confirm({
        title: 'Discard unsaved changes?',
        body: 'Selecting another preview will discard your unsaved dashboard edits. Your saved dashboard is unchanged.',
        confirmLabel: 'Discard changes',
      }))
    )
      return;
    setDraft(templateDraft(id));
  };
  const persist = async (next: Draft, message: string) => {
    if (!(await confirm({ title: 'Update your dashboard?', body: message, confirmLabel: 'Apply dashboard' }))) return;
    const canonical = next.preset && equal(next.items, PRESETS[next.preset].items);
    const settings: DashboardSettings = { preset: next.preset, ...(canonical ? {} : { items: next.items }), density: next.density };
    await save.mutateAsync(settings).catch(() => {});
  };
  const restoreDefault = () =>
    persist(
      templateDraft(me.workspace.role === 'member' ? 'personal' : 'executive'),
      'This replaces your saved layout with the default for your current role. Project data will not change.',
    );
  const move = (index: number, delta: number) =>
    setDraft((d) => {
      const items = [...d.items];
      const next = index + delta;
      if (next < 0 || next >= items.length) return d;
      [items[index], items[next]] = [items[next], items[index]];
      return { ...d, items };
    });
  const available = (Object.keys(WIDGETS) as WidgetId[]).filter((id) => !draft.items.some((i) => i.widget === id));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">Personalization / Dashboard</p>
          <h2 className="mt-2 text-2xl font-semibold">Customize Your Dashboard</h2>
          <p className="mt-2 text-sm text-zinc-500">Your layout is private to your account and does not change shared records.</p>
          <p className="mt-2 text-sm">
            Current: <strong>{layout.preset ? PRESETS[layout.preset].label : 'Custom layout'}</strong>
            {layout.isDefault ? ' · Suggested for your role' : custom ? ' · Customized' : ''}{' '}
            <span className="text-zinc-500">
              · {layout.updatedAt ? `Saved ${new Date(layout.updatedAt).toLocaleString()}` : 'No saved changes yet'}
            </span>
          </p>
        </div>
        <Link to="/" className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">
          Back to dashboard
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {TEMPLATE_IDS.map((id) => (
          <TemplateCard key={id} id={id} selected={draft.preset === id} active={layout.preset === id} onSelect={() => void select(id)} />
        ))}
      </div>
      <details className="rounded-lg border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer text-sm font-semibold">Previous dashboard presets</summary>
        <p className="mt-2 text-xs text-zinc-500">Your existing product-focused presets remain available.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESET_IDS.filter((id) => !(TEMPLATE_IDS as readonly string[]).includes(id)).map((id) => (
            <Button key={id} size="sm" variant={draft.preset === id ? 'primary' : 'secondary'} onClick={() => void select(id)}>
              {PRESETS[id].label}
              {layout.preset === id ? ' · Active' : ''}
            </Button>
          ))}
        </div>
      </details>
      <Card>
        <div className="border-b border-slate-200 p-4 dark:border-zinc-800">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="font-semibold">Arrange widgets</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Preview and adjust the selected template. Compact view reduces spacing and the number of rows in project widgets. Changes
                are saved only when you apply them.
              </p>
            </div>
            <label className="text-xs text-zinc-500">
              Display{' '}
              <Select
                aria-label="Display density"
                value={draft.density}
                onChange={(e) => setDraft((d) => ({ ...d, density: e.target.value as Draft['density'] }))}
                className="mt-1 w-32 py-1.5"
              >
                <option value="expanded">Expanded</option>
                <option value="compact">Compact</option>
              </Select>
            </label>
          </div>
          <div className="mt-4">
            <Preview items={draft.items} />
          </div>
        </div>
        <div className="space-y-2 p-4">
          {draft.items.length === 0 && <p className="text-sm text-zinc-500">All widgets are hidden. Add one below to show it.</p>}
          {draft.items.map((item, index) => (
            <div key={item.widget} className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
              <div className="min-w-32 flex-1">
                <p className="text-sm font-medium">{WIDGETS[item.widget].title}</p>
                <p className="text-xs text-zinc-500">
                  {WIDGET_DEFINITIONS[item.widget].dataSource} · {WIDGET_DEFINITIONS[item.widget].permissions}
                  {WIDGET_DEFINITIONS[item.widget].filters.length ? ` · ${WIDGET_DEFINITIONS[item.widget].filters.join(', ')}` : ''}
                </p>
              </div>
              <Select
                aria-label={`Width of ${WIDGETS[item.widget].title}`}
                value={item.span}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    items: d.items.map((x, i) => (i === index ? { ...x, span: Number(e.target.value) as DashboardSpan } : x)),
                  }))
                }
                className="w-24 py-1 text-xs"
              >
                {WIDGETS[item.widget].spans.map((n) => (
                  <option key={n} value={n}>
                    {n}/12
                  </option>
                ))}
              </Select>
              <button
                aria-label={`Move ${WIDGETS[item.widget].title} up`}
                disabled={index === 0}
                className="rounded p-2 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                aria-label={`Move ${WIDGETS[item.widget].title} down`}
                disabled={index === draft.items.length - 1}
                className="rounded p-2 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((x) => x.widget !== item.widget) }))}
              >
                Hide
              </Button>
            </div>
          ))}
          {available.length > 0 && (
            <details className="pt-2">
              <summary className="cursor-pointer text-sm font-medium text-blue-700 dark:text-blue-400">
                Show hidden or additional widgets
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {available.map((id) => (
                  <Button
                    key={id}
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        items: [...d.items, { widget: id, span: WIDGETS[id].spans[WIDGETS[id].spans.length - 1] }],
                      }))
                    }
                  >
                    + {WIDGETS[id].title}
                  </Button>
                ))}
              </div>
            </details>
          )}
          {draft.preset && (
            <Button variant="ghost" size="sm" onClick={() => setDraft((d) => ({ ...templateDraft(d.preset!), density: d.density }))}>
              Restore template arrangement
            </Button>
          )}
        </div>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          loading={save.isPending}
          disabled={!dirty || (draft.preset === null && draft.items.length === 0)}
          onClick={() =>
            void persist(
              draft,
              custom
                ? 'This replaces your saved customizations. Shared project data will not change.'
                : 'This updates only your personal dashboard. Shared project data will not change.',
            )
          }
        >
          Apply Template
        </Button>
        <Button variant="secondary" disabled={save.isPending} onClick={() => void restoreDefault()}>
          Reset to Default
        </Button>
        <span className="text-xs text-zinc-500" role="status">
          {save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved layout shown'}
        </span>
      </div>
    </div>
  );
}

function TemplateCard({
  id,
  selected,
  active,
  onSelect,
}: {
  id: (typeof TEMPLATE_IDS)[number];
  selected: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const template = PRESETS[id];
  const details = TEMPLATE_DETAILS[id];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        'rounded-lg border bg-white p-4 text-left transition-colors dark:bg-zinc-900',
        selected ? 'border-blue-600 ring-2 ring-blue-500/20' : 'border-slate-200 hover:border-blue-300 dark:border-zinc-800',
      )}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">{details.audience}</span>
        {active && <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Active</span>}
      </div>
      <h3 className="mt-2 font-semibold">{template.label}</h3>
      <p className="mt-1 min-h-10 text-sm text-zinc-500">{template.blurb}</p>
      <div className="mt-4">
        <Preview items={template.items} />
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
        <strong>Includes:</strong> {template.items.map((i) => WIDGETS[i.widget].title).join(', ')}.
      </p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{details.unavailable}</p>
      <span className="mt-3 block text-xs font-semibold text-blue-700 dark:text-blue-400">
        {selected ? 'Selected preview' : 'Preview template'}
      </span>
    </button>
  );
}
