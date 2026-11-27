import { useEffect, useRef, useState } from 'react';
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
  const dirty = draft.contentWidth !== settings.contentWidth;
  const previous = useRef(settings);
  useEffect(() => {
    const old = previous.current;
    previous.current = settings;
    setDraft((current) => (current.contentWidth === old.contentWidth ? settings : current));
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
      setDraft(await save.mutateAsync({ ...settings, contentWidth: draft.contentWidth }));
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
            Choose how wide pages appear on desktop.
          </p>
        </div>
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
          <Button variant="secondary" onClick={() => setDraft({ ...settings, contentWidth: DEFAULT_APP_LAYOUT.contentWidth })}>
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
