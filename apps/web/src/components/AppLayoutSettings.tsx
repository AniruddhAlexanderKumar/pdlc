import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_APP_LAYOUT, type AppLayoutSettings as Preferences } from '@sv/shared';
import { useAppLayout, useSaveAppLayout } from '../api/hooks';
import { Button, Card, Select, Spinner, cx } from './ui';

const NAVIGATION_OPTIONS: { value: Preferences['navigation']; label: string; description: string }[] = [
  { value: 'expanded', label: 'Expanded sidebar', description: 'A full menu with labels and counts.' },
  { value: 'compact', label: 'Compact sidebar', description: 'An icon rail that gives content more space.' },
  { value: 'tabs', label: 'Top tabs', description: 'Switch sections from a horizontal tab bar.' },
  { value: 'menu', label: 'Top menu', description: 'Open a dropdown when you need navigation.' },
];

function NavigationPreview({ style }: { style: Preferences['navigation'] }) {
  const side = style === 'expanded' || style === 'compact';
  return (
    <div
      aria-hidden="true"
      className="flex h-20 overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-zinc-950"
    >
      {side && (
        <div
          className={cx(
            'space-y-1 border-r border-slate-200 bg-white p-1.5 dark:border-zinc-700 dark:bg-zinc-900',
            style === 'expanded' ? 'w-14' : 'w-7',
          )}
        >
          <div className="h-2 rounded bg-blue-400" />
          <div className="h-1.5 rounded bg-slate-200 dark:bg-zinc-700" />
          <div className="h-1.5 rounded bg-slate-200 dark:bg-zinc-700" />
          <div className="h-1.5 rounded bg-slate-200 dark:bg-zinc-700" />
        </div>
      )}
      <div className="flex-1">
        {!side && (
          <div className="flex h-5 items-center gap-1 border-b border-slate-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900">
            {style === 'tabs' ? (
              <>
                <div className="h-1.5 w-6 rounded bg-blue-400" />
                <div className="h-1.5 w-6 rounded bg-slate-200 dark:bg-zinc-700" />
                <div className="h-1.5 w-6 rounded bg-slate-200 dark:bg-zinc-700" />
              </>
            ) : (
              <>
                <div className="h-2 w-3 rounded bg-blue-400" />
                <div className="h-1.5 w-10 rounded bg-slate-200 dark:bg-zinc-700" />
              </>
            )}
          </div>
        )}
        <div className="space-y-1.5 p-2">
          <div className="h-2 w-1/3 rounded bg-slate-300 dark:bg-zinc-700" />
          <div className="h-6 rounded bg-white dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}

export function AppLayoutSettings({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const query = useAppLayout();
  if (query.isLoading) return <Spinner label="Loading application layout" />;
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-4 text-sm">
        Could not load application layout.{' '}
        <button className="text-blue-700 underline" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  return <Editor settings={query.data} onDirtyChange={onDirtyChange} />;
}

function Editor({ settings, onDirtyChange }: { settings: Preferences; onDirtyChange?: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(settings);
  const save = useSaveAppLayout();
  const dirty = useMemo(() => draft.navigation !== settings.navigation || draft.contentWidth !== settings.contentWidth, [draft, settings]);
  const previous = useRef(settings);
  useEffect(() => {
    const old = previous.current;
    previous.current = settings;
    setDraft((current) => (current.navigation === old.navigation && current.contentWidth === old.contentWidth ? settings : current));
  }, [settings]);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const apply = async () => {
    try {
      setDraft(await save.mutateAsync(draft));
    } catch {
      /* The hook reports the error; keep the draft. */
    }
  };
  return (
    <Card>
      <fieldset disabled={save.isPending} className="min-w-0 space-y-5 p-5">
        <div>
          <h2 className="text-lg font-semibold">Application layout</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Choose a navigation style for desktop. Your selection is private to your account; mobile navigation stays the same.
          </p>
        </div>
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-semibold">Navigation style</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {NAVIGATION_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cx(
                  'cursor-pointer rounded-lg border p-3 transition-colors',
                  draft.navigation === option.value
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/30 dark:bg-blue-950/30'
                    : 'border-slate-200 hover:border-blue-300 dark:border-zinc-700',
                )}
              >
                <NavigationPreview style={option.value} />
                <div className="mt-3 flex items-start gap-2">
                  <input
                    type="radio"
                    name="navigation-style"
                    value={option.value}
                    checked={draft.navigation === option.value}
                    onChange={() => setDraft((d) => ({ ...d, navigation: option.value }))}
                    className="mt-1 accent-blue-600"
                  />
                  <span>
                    <span className="block text-sm font-semibold">
                      {option.label}
                      {settings.navigation === option.value ? ' · Current' : ''}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">{option.description}</span>
                  </span>
                </div>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block max-w-xs space-y-1.5 text-sm font-medium">
          <span>Content width</span>
          <Select
            aria-label="Content width"
            value={draft.contentWidth}
            onChange={(e) => setDraft((d) => ({ ...d, contentWidth: e.target.value as Preferences['contentWidth'] }))}
          >
            <option value="full">Full width</option>
            <option value="constrained">Constrained</option>
          </Select>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!dirty} loading={save.isPending} onClick={() => void apply()}>
            Save application layout
          </Button>
          <Button variant="secondary" onClick={() => setDraft({ ...DEFAULT_APP_LAYOUT })}>
            Restore defaults
          </Button>
          <span className="text-xs text-zinc-500" role="status">
            {save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved layout shown'}
          </span>
        </div>
      </fieldset>
    </Card>
  );
}
