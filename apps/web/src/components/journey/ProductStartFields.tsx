import { useState } from 'react';
import { readNote } from './RecordedWork';
import {
  KIND_LABELS,
  PATH_STAGES,
  PRODUCT_KINDS,
  type GuideMode,
  type ProductKind,
  type StageId
} from '@sv/shared';
import { Field, Input, Select } from '../ui';

export const startValues = (guideMode: GuideMode = 'beginner') => ({
  name: '',
  notes: '',
  productKind: 'other' as ProductKind,
  startingStage: 'Idea' as StageId,
  guideMode
});
/** Shared between registration and product creation. Solo/team is already known
 * from the workspace. Depth captures familiarity without a separate survey. */
export function ProductStartFields({
  value,
  onChange
}: {
  value: ReturnType<typeof startValues>;
  onChange: (v: ReturnType<typeof startValues>) => void;
}) {
  const [error, setError] = useState('');
  return (
    <div className="space-y-4">
      <Field label="Product name" htmlFor="product-name" hint="A working name is enough. You can change it later.">
        <Input
          id="product-name"
          maxLength={120}
          required
          value={value.name}
          placeholder="e.g. Open Slot"
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What kind of product?" htmlFor="product-kind">
          <Select
            id="product-kind"
            value={value.productKind}
            onChange={(e) => onChange({ ...value, productKind: e.target.value as ProductKind })}
          >
            {PRODUCT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Where are you now?" htmlFor="starting-stage">
          <Select
            id="starting-stage"
            value={value.startingStage}
            onChange={(e) => onChange({ ...value, startingStage: e.target.value as StageId })}
          >
            {PATH_STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="How familiar is product development?"
        htmlFor="guide-mode"
        hint="This changes your guidance, not the work or your permissions."
      >
        <Select
          id="guide-mode"
          value={value.guideMode}
          onChange={(e) => onChange({ ...value, guideMode: e.target.value as GuideMode })}
        >
          <option value="beginner">New to building · beginner guidance</option>
          <option value="advanced">Experienced builder · advanced guidance</option>
        </Select>
      </Field>
      <details className="sv-inset p-3 text-xs">
        <summary className="cursor-pointer font-semibold">Already developing this? Bring existing work</summary>
        <p className="my-2">
          Choose your current world above. Paste or import a project note, review it, then create the product. It
          will be saved in the product notebook, not treated as verified completion.
        </p>
        <label>
          Project notebook
          <textarea
            className="my-2 block w-full rounded border bg-transparent p-2"
            rows={4}
            value={value.notes}
            maxLength={10000}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
          />
        </label>
        <label>
          Import text (.txt / .md)
          <input
            className="block w-full"
            type="file"
            accept=".txt,.md"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const notes = await readNote(f, 10000);
                onChange({ ...value, notes });
                setError('');
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </label>
        {error && <p role="alert">{error}</p>}
      </details>
    </div>
  );
}