import { useState } from 'react';
import type { Journey } from '@sv/shared';
import { useAddDependency, useRemoveDependency } from '../../api/collaboration';
import { Button, Select } from '../ui';

/** The existing dependency graph, edited in context instead of a second task model. */
export function ActivityDependencies({
  productId,
  activityKey,
  journey,
  linked,
  editable
}: {
  productId: string;
  activityKey: string;
  journey: Journey;
  linked: string[];
  editable: boolean;
}) {
  const [selected, setSelected] = useState('');
  const add = useAddDependency(productId),
    remove = useRemoveDependency(productId);
  const choices = journey.path.flatMap((stage) =>
    stage.activities.map((a) => ({ id: a.id, label: `${stage.id} · ${a.label}` }))
  );
  const busy = add.isPending || remove.isPending;
  return (
    <details className="rounded-md border border-zinc-200 p-3 text-xs dark:border-zinc-700">
      <summary className="cursor-pointer font-medium">Prerequisites ({linked.length})</summary>
      <p className="mt-2 text-zinc-500">
        Link the work this activity depends on. Outstanding prerequisites appear under Needs attention.
      </p>
      {linked.length > 0 && (
        <ul className="mt-2 space-y-2">
          {linked.map((key) => (
            <li key={key} className="flex items-start justify-between gap-2">
              <span>{choices.find((x) => x.id === key)?.label ?? key}</span>
              {editable && (
                <button
                  type="button"
                  className="sv-link"
                  aria-label={`Remove prerequisite ${key}`}
                  disabled={busy}
                  onClick={() => remove.mutate({ key: activityKey, dependsOnKey: key })}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            className="min-w-0 max-w-full flex-1 text-xs"
            aria-label="Choose a prerequisite"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose an activity…</option>
            {choices
              .filter((x) => x.id !== activityKey && !linked.includes(x.id))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !selected}
            onClick={() =>
              add.mutate({ key: activityKey, dependsOnKey: selected }, { onSuccess: () => setSelected('') })
            }
          >
            Link prerequisite
          </Button>
        </div>
      )}
    </details>
  );
}
