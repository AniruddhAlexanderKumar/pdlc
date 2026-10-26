import { PRESETS, PRESET_IDS, type PresetId } from '@sv/shared';
import { cx } from '../ui';

/**
 * Preset switcher. To open up custom layouts later, add a "Custom" option here that opens an
 * editor and saves `{ preset: null, items }` (see routes/dashboard.ts); `current` is null
 * for a custom layout, so nothing is highlighted until then.
 */
export function PresetPicker({ current, onChange, disabled }: { current: PresetId | null; onChange: (preset: PresetId) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span id="layout-presets-label" className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        Layout presets
      </span>
      <div role="radiogroup" aria-labelledby="layout-presets-label" className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
        {PRESET_IDS.map((id) => {
          const selected = current === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              title={PRESETS[id].blurb}
              disabled={disabled}
              onClick={() => !selected && onChange(id)}
              className={cx(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                selected ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
              )}
            >
              {PRESETS[id].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
