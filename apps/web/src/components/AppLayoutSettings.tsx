import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_APP_LAYOUT, type AppLayoutSettings as Preferences } from '@sv/shared';
import { useAppLayout, useSaveAppLayout } from '../api/hooks';
import { Button, Card, Select, Spinner } from './ui';

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
  useEffect(() => {
    if (!dirty) setDraft(settings);
  }, [settings, dirty]);
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
  return (
    <Card>
      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Application layout</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Choose how your workspace appears on desktop. Mobile navigation stays the same. Settings are private to your account.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium">
            <span>Navigation</span>
            <Select
              aria-label="Navigation"
              value={draft.navigation}
              onChange={(e) => setDraft((d) => ({ ...d, navigation: e.target.value as Preferences['navigation'] }))}
            >
              <option value="expanded">Expanded sidebar</option>
              <option value="compact">Compact sidebar</option>
            </Select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
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
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(draft)}>
            Save application layout
          </Button>
          <Button variant="secondary" disabled={save.isPending} onClick={() => setDraft({ ...DEFAULT_APP_LAYOUT })}>
            Restore defaults
          </Button>
          <span className="text-xs text-zinc-500" role="status">
            {save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved layout shown'}
          </span>
        </div>
      </div>
    </Card>
  );
}
