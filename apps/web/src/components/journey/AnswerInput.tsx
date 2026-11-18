import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { EVIDENCE_TYPES, type AnswerValue, type Question } from '@sv/shared';
import { Button, cx, Field, IconButton, Input, Select, Textarea } from '../ui';
import { useMoney } from '../../lib/money';

/** Renders the right control for a question type. `value` is the draft, not the saved answer. */
export function AnswerInput({
  q,
  value,
  onChange,
  onSubmit,
  autoFocus
}: {
  q: Question;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const { symbol } = useMoney();
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  switch (q.type) {
    case 'text':
      return (
        <Input
          autoFocus={autoFocus}
          aria-label={q.prompt}
          maxLength={300}
          value={(value as string) ?? ''}
          placeholder={q.placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={enter}
        />
      );
    case 'longtext':
      return (
        <Textarea
          autoFocus={autoFocus}
          aria-label={q.prompt}
          rows={4}
          maxLength={5000}
          value={(value as string) ?? ''}
          placeholder={q.placeholder ?? 'Write in your own words…'}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
    case 'money':
      return (
        <div className="relative max-w-xs">
          {q.type === 'money' && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
              {symbol}
            </span>
          )}
          <Input
            autoFocus={autoFocus}
            aria-label={q.prompt}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            className={cx('tabular-nums', q.type === 'money' && 'pl-8')}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            onKeyDown={enter}
          />
        </div>
      );
    case 'date':
      return (
        <Input
          autoFocus={autoFocus}
          aria-label={q.prompt}
          type="date"
          className="max-w-xs"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          onKeyDown={enter}
        />
      );
    case 'yesno':
      return (
        <div className="flex gap-2">
          {[
            { v: true, label: 'Yes' },
            { v: false, label: 'Not yet' }
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={value === o.v}
              onClick={() => onChange(o.v)}
              className={cx(
                'min-w-24 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                value === o.v
                  ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                  : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      );
    case 'scale':
      return (
        <div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={value === n}
                aria-label={`${n} of 5`}
                onClick={() => onChange(n)}
                className={cx(
                  'h-11 w-11 rounded-lg border text-sm font-semibold tabular-nums transition-all',
                  value === n
                    ? 'scale-105 border-blue-500 bg-blue-600 text-white shadow-sm'
                    : 'border-zinc-200 hover:border-blue-300 dark:border-zinc-700'
                )}
              >
                {n}
              </button>
            ))}
          </div>
          {q.scale && (
            <div className="mt-1.5 flex w-[15.5rem] justify-between text-[11px] text-zinc-500">
              <span>{q.scale[0]}</span>
              <span>{q.scale[1]}</span>
            </div>
          )}
        </div>
      );
    case 'comparison': {
      const cells = Array.isArray(value) ? value : ['', '', ''];
      const change = (i: number, v: string) => onChange(cells.map((x, n) => (n === i ? v : x)));
      return (
        <div className="space-y-4">
          <Field label="Comparison criterion" htmlFor="comparison-criterion">
            <Input
              id="comparison-criterion"
              maxLength={1000}
              value={cells[0]}
              onChange={(e) => change(0, e.target.value)}
              placeholder="e.g. How it handles a cancellation"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <Field key={i} label={`Alternative ${i}`} htmlFor={`alternative-${i}`}>
                <Textarea
                  id={`alternative-${i}`}
                  rows={3}
                  maxLength={1000}
                  placeholder="Name, observation and source…"
                  value={cells[i]}
                  onChange={(e) => change(i, e.target.value)}
                />
              </Field>
            ))}
          </div>
        </div>
      );
    }
    case 'ranked': {
      const list = Array.isArray(value) && value.length ? value : [''];
      const move = (from: number, to: number) => {
        if (!Number.isInteger(from) || from < 0 || from >= list.length || to < 0 || to >= list.length || from === to)
          return;
        const next = [...list];
        next.splice(to, 0, next.splice(from, 1)[0]);
        onChange(next);
      };
      return (
        <div className="space-y-2">
          {list.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-1"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const n = e.dataTransfer.getData('text/x-sv-order');
                if (n) move(Number(n), i);
              }}
            >
              <span
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/x-sv-order', String(i))}
                className="cursor-grab px-1 font-mono text-sm text-zinc-500"
              >
                {i + 1}.
              </span>
              <Input
                aria-label={`Priority ${i + 1}`}
                maxLength={200}
                value={item}
                placeholder="Name one item"
                onChange={(e) => onChange(list.map((x, n) => (n === i ? e.target.value : x)))}
              />
              <IconButton label={`Move item ${i + 1} up`} disabled={!i} onClick={() => move(i, i - 1)}>
                <ArrowUp size={15} />
              </IconButton>
              <IconButton
                label={`Move item ${i + 1} down`}
                disabled={i === list.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ArrowDown size={15} />
              </IconButton>
              <IconButton label={`Remove item ${i + 1}`} onClick={() => onChange(list.filter((_, n) => n !== i))}>
                <X size={15} />
              </IconButton>
            </div>
          ))}
          <Button variant="secondary" size="sm" disabled={list.length >= 12} onClick={() => onChange([...list, ''])}>
            Add item
          </Button>
        </div>
      );
    }
    case 'evidence': {
      const [basis, note, source] = Array.isArray(value) ? value : [EVIDENCE_TYPES[0], '', ''];
      return (
        <div className="space-y-3">
          <Field htmlFor="basis" label="What is this based on?">
            <Select id="basis" value={basis} onChange={(e) => onChange([e.target.value, note, source])}>
              {EVIDENCE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="observation" label="Observation or assumption">
            <Textarea
              id="observation"
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(e) => onChange([basis, e.target.value, source])}
            />
          </Field>
          <Field
            htmlFor="source"
            label={basis === EVIDENCE_TYPES[0] ? 'Source or plan to check (optional)' : 'Traceable source and date'}
          >
            <Input
              id="source"
              value={source}
              maxLength={2000}
              placeholder="e.g. Anonymised interview note, 12 November"
              onChange={(e) => onChange([basis, note, e.target.value])}
            />
          </Field>
        </div>
      );
    }
    case 'choice':
    case 'multi': {
      const selected: string[] =
        q.type === 'multi' ? (Array.isArray(value) ? value : []) : typeof value === 'string' ? [value] : [];
      return (
        <div className="flex flex-wrap gap-2">
          {q.options?.map((o) => {
            const on = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  if (q.type === 'choice') onChange(o);
                  else onChange(on ? selected.filter((x) => x !== o) : [...selected, o]);
                }}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-sm transition-colors',
                  on
                    ? 'border-blue-500 bg-blue-500/10 font-medium text-blue-700 dark:text-blue-300'
                    : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
  }
}

export function formatAnswer(q: Question, v: AnswerValue, fmt: (n: number) => string) {
  if (v === null || v === undefined) return '';
  if (q.type === 'money' && typeof v === 'number') return fmt(v);
  if (q.type === 'yesno') return v ? 'Yes' : 'Not yet';
  if (q.type === 'scale') return `${v} / 5`;
  if (Array.isArray(v)) {
    if (q.type === 'evidence')
      return `${v[0]} (founder-reported)\n${v[1]}${v[2] ? `\nSource / follow-up: ${v[2]}` : ''}`;
    if (q.type === 'comparison') return `Criterion: ${v[0]}\nAlternative 1: ${v[1]}\nAlternative 2: ${v[2]}`;
    if (q.type === 'ranked') return v.map((x, i) => `${i + 1}. ${x}`).join('\n');
    return v.join(', ');
  }
  return String(v);
}
